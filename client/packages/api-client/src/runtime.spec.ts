import {
  type ApiFetch,
  configureApiRuntime,
  getApiBaseUrl,
  getProblemDetails,
  teamspaceFetcher,
} from '@repo/client/api-client/runtime';
import {
  parseServerSentEvent,
  streamServerSentEvents,
} from '@repo/client/api-client/sse';

import { jest } from '@jest/globals';

afterEach(() => {
  configureApiRuntime({});
  jest.restoreAllMocks();
});

describe('API 런타임', () => {
  it('구성된 API base URL만 Agent 같은 절대 URL 소비자에게 노출한다', () => {
    configureApiRuntime({ baseUrl: 'https://api.example.com/' });

    expect(getApiBaseUrl()).toBe('https://api.example.com');
  });

  it('API runtime이 구성되지 않았으면 base URL 조회를 fail-fast한다', () => {
    expect(() => getApiBaseUrl()).toThrow(
      'API runtime base URL이 구성되지 않았습니다.',
    );
  });

  it('네이티브 요청에 쿠키와 Expo 출처 헤더를 함께 전달한다', async () => {
    const fetcher = jest.fn<ApiFetch>(async () => Response.json({ ok: true }));
    configureApiRuntime({
      baseUrl: 'https://api.example.com/',
      credentials: 'omit',
      expoOrigin: 'aiteamspace://',
      fetcher,
      getCookie: async () => 'better-auth.session=token',
    });

    await teamspaceFetcher('/chat/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.com/chat/channels');
    const headers = new Headers(request?.headers);
    expect(headers.get('cookie')).toBe('better-auth.session=token');
    expect(headers.get('expo-origin')).toBe('aiteamspace://');
    expect(headers.get('content-type')).toBe('application/json');
    expect(request?.credentials).toBe('omit');
  });

  it('Nest Problem Details 오류를 생성 계약 그대로 throw한다', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: '이미 존재하는 대화입니다.',
    };
    configureApiRuntime({
      fetcher: async () => Response.json(problem, { status: 409 }),
    });

    await expect(
      teamspaceFetcher('/chat/conversations', { method: 'GET' }),
    ).rejects.toEqual(problem);
  });

  it('계약 밖 오류 응답은 일반 기술 오류로 구분한다', async () => {
    configureApiRuntime({
      fetcher: async () => new Response('게이트웨이 오류', { status: 502 }),
    });

    await expect(
      teamspaceFetcher('/chat/conversations', { method: 'GET' }),
    ).rejects.toThrow('invalid Problem Details response');
  });

  it('Problem Details 구조만 오류 표시 데이터로 인정한다', () => {
    expect(
      getProblemDetails({
        title: 'Bad Request',
        status: 400,
        detail: '입력값을 확인해 주세요.',
      }),
    ).toMatchObject({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: '입력값을 확인해 주세요.',
    });
    expect(getProblemDetails(new Error('network'))).toBeNull();
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
