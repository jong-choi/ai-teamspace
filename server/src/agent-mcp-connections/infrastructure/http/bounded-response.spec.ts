import { withBoundedResponseBody } from '@/agent-mcp-connections/infrastructure/http/bounded-response';

import { GuardedFetchErrorCode } from 'guarded-fetch';

describe('external MCP bounded response body', () => {
  test('content-length가 bound를 넘으면 body read 전에 거부한다', () => {
    const response = new Response('oversized', {
      headers: { 'content-length': '999' },
    });

    expect(() => withBoundedResponseBody(response, 10)).toThrow(
      expect.objectContaining({
        code: GuardedFetchErrorCode.RESPONSE_TOO_LARGE,
      }),
    );
  });

  test('streaming body가 bound를 넘는 순간 reader를 실패시킨다', async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(6));
          controller.enqueue(new Uint8Array(6));
          controller.close();
        },
      }),
    );
    const bounded = withBoundedResponseBody(response, 10);

    await expect(bounded.arrayBuffer()).rejects.toMatchObject({
      code: GuardedFetchErrorCode.RESPONSE_TOO_LARGE,
    });
  });

  test('bound 이내 body와 response metadata를 보존한다', async () => {
    const response = new Response('safe', {
      status: 201,
      statusText: 'Created',
      headers: { 'x-test': 'yes' },
    });
    const bounded = withBoundedResponseBody(response, 16);

    await expect(bounded.text()).resolves.toBe('safe');
    expect(bounded.status).toBe(201);
    expect(bounded.statusText).toBe('Created');
    expect(bounded.headers.get('x-test')).toBe('yes');
  });
});
