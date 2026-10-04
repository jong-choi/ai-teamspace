import {
  type ApiFetch,
  configureApiRuntime,
  WorkOsApiError,
  workOsFetcher,
} from '@monorepo-erp/api-client/runtime';
import {
  parseServerSentEvent,
  streamServerSentEvents,
} from '@monorepo-erp/api-client/sse';

import { jest } from '@jest/globals';

afterEach(() => {
  configureApiRuntime({});
  jest.restoreAllMocks();
});

describe('API 런타임', () => {
  it('네이티브 요청에 쿠키와 Expo 출처 헤더를 함께 전달한다', async () => {
    const fetcher = jest.fn<ApiFetch>(async () => Response.json({ ok: true }));
    configureApiRuntime({
      baseUrl: 'https://api.example.com/',
      expoOrigin: 'monorepoerp://',
      fetcher,
      getCookie: async () => 'better-auth.session=token',
    });

    await workOsFetcher('/chat/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.com/chat/channels');
    const headers = new Headers(request?.headers);
    expect(headers.get('cookie')).toBe('better-auth.session=token');
    expect(headers.get('expo-origin')).toBe('monorepoerp://');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('JSON이 아닌 오류 응답도 Problem Details 표시용 상세 내용으로 보존한다', async () => {
    configureApiRuntime({
      fetcher: async () => new Response('게이트웨이 오류', { status: 502 }),
    });

    await expect(
      workOsFetcher('/chat/conversations', { method: 'GET' }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<WorkOsApiError>>({
        status: 502,
        info: { detail: '게이트웨이 오류' },
      }),
    );
  });

  it('SSE 프레임의 식별자, 이벤트 이름과 여러 데이터 줄을 파싱한다', () => {
    expect(
      parseServerSentEvent(
        ': heartbeat\nid: event-1\nevent: message.created\ndata: {"first":1,\ndata: "second":2}',
      ),
    ).toEqual({
      id: 'event-1',
      event: 'message.created',
      data: '{"first":1,\n"second":2}',
    });
  });

  it('SSE 이벤트 처리 하나가 실패해도 같은 연결의 다음 이벤트를 계속 처리한다', async () => {
    const encoder = new TextEncoder();
    const abortController = new AbortController();
    const onError = jest.fn();
    const handled: string[] = [];

    configureApiRuntime({
      fetcher: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'event: first\ndata: 1\n\nevent: second\ndata: 2\n\n',
                ),
              );
              controller.close();
            },
          }),
          { status: 200 },
        ),
    });

    await streamServerSentEvents({
      path: '/chat/events',
      signal: abortController.signal,
      onEvent: async (event) => {
        handled.push(event.event);
        if (event.event === 'first') {
          throw new Error('첫 이벤트 처리 실패');
        }
        abortController.abort();
      },
      onError,
    });

    expect(handled).toEqual(['first', 'second']);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
