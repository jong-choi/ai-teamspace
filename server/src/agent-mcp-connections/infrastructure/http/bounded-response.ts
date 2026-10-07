import {
  GuardedFetchError,
  GuardedFetchErrorCode,
  OPAQUE_ERROR_MESSAGE,
} from 'guarded-fetch';

export function withBoundedResponseBody(
  response: Response,
  maximumBytes: number,
): Response {
  const contentLength = parseContentLength(response.headers.get('content-length'));
  if (contentLength !== null && contentLength > maximumBytes) {
    void response.body?.cancel();
    throw responseTooLarge();
  }

  if (!response.body) {
    return response;
  }

  const reader = response.body.getReader();
  let receivedBytes = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          return;
        }

        receivedBytes += chunk.value.byteLength;
        if (receivedBytes > maximumBytes) {
          await reader.cancel();
          controller.error(responseTooLarge());
          return;
        }

        controller.enqueue(chunk.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });

  const bounded = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  Object.defineProperties(bounded, {
    url: { value: response.url },
    redirected: { value: response.redirected },
    type: { value: response.type },
  });
  return bounded;
}

function parseContentLength(value: string | null): number | null {
  if (value === null || !/^\d+$/u.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function responseTooLarge(): GuardedFetchError {
  return new GuardedFetchError(
    GuardedFetchErrorCode.RESPONSE_TOO_LARGE,
    OPAQUE_ERROR_MESSAGE,
  );
}
