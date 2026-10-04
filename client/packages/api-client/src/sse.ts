import {
  getApiFetch,
  getApiHeaders,
  getApiUrl,
} from '@monorepo-erp/api-client/runtime';

export type ServerSentEvent = {
  id?: string;
  event: string;
  data: string;
};

export type ServerSentEventStreamOptions = {
  path: string;
  signal: AbortSignal;
  onEvent: (event: ServerSentEvent) => void | Promise<void>;
  onReconnect?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
};

const RECONNECT_DELAYS_MS = [750, 1_500, 3_000, 5_000] as const;

export async function streamServerSentEvents({
  path,
  signal,
  onEvent,
  onReconnect,
  onError,
}: ServerSentEventStreamOptions): Promise<void> {
  let reconnectAttempt = 0;
  let reconnecting = false;

  while (!signal.aborted) {
    try {
      const response = await getApiFetch()(getApiUrl(path), {
        credentials: 'include',
        headers: await getApiHeaders({ Accept: 'text/event-stream' }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`SSE request failed with ${response.status}`);
      }
      if (!response.body) {
        throw new Error('SSE 응답 스트림을 사용할 수 없습니다.');
      }

      if (reconnecting) {
        try {
          await onReconnect?.();
        } catch (error) {
          reportError(onError, error);
        }
        reconnecting = false;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        reconnectAttempt = 0;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          const event = parseServerSentEvent(block);
          if (!event) {
            continue;
          }

          try {
            await onEvent(event);
          } catch (error) {
            reportError(onError, error);
          }
        }
      }

      if (!signal.aborted) {
        reconnecting = true;
      }
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      reconnecting = true;
      reportError(onError, error);
    }

    if (signal.aborted) {
      return;
    }

    const delay =
      RECONNECT_DELAYS_MS[
        Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
      ];
    reconnectAttempt += 1;
    await wait(delay, signal);
  }
}

export function parseServerSentEvent(block: string): ServerSentEvent | null {
  let id: string | undefined;
  let event = '';
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(':')) {
      continue;
    }
    if (line.startsWith('id:')) {
      id = readFieldValue(line, 'id:');
      continue;
    }
    if (line.startsWith('event:')) {
      event = readFieldValue(line, 'event:');
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(readFieldValue(line, 'data:'));
    }
  }

  if (!event) {
    return null;
  }

  return {
    ...(id ? { id } : {}),
    event,
    data: dataLines.join('\n'),
  };
}

function readFieldValue(line: string, prefix: string): string {
  const value = line.slice(prefix.length);
  return value.startsWith(' ') ? value.slice(1) : value;
}

function reportError(
  onError: ServerSentEventStreamOptions['onError'],
  error: unknown,
): void {
  try {
    onError?.(error);
  } catch {
    // 오류 보고 콜백이 transport lifecycle을 깨지 않게 격리한다.
  }
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timeout = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}
