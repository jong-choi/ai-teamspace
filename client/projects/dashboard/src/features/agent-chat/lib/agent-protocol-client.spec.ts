import {
  type ApiFetch,
  configureApiRuntime,
} from '@repo/client/api-client/runtime';
import {
  createAgentFetch,
  createAgentProtocolClient,
} from '@core/features/agent-chat/lib/agent-protocol-client';

import { afterEach, describe, expect, it, jest } from '@jest/globals';

afterEach(() => {
  configureApiRuntime({});
  jest.restoreAllMocks();
});

describe('Agent Protocol client', () => {
  it('configured API runtime이 없으면 localhost fallback 대신 fail-fast한다', () => {
    expect(() => createAgentProtocolClient()).toThrow(
      'API runtime base URL이 구성되지 않았습니다.',
    );
  });

  it('SDK 요청에 기존 native auth cookie/origin fetch contract를 재사용한다', async () => {
    const fetcher = jest.fn<ApiFetch>(async () => Response.json({ ok: true }));
    configureApiRuntime({
      baseUrl: 'https://api.example.com/base/',
      credentials: 'omit',
      expoOrigin: 'aiteamspace://',
      fetcher,
      getCookie: async () => 'better-auth.session=token',
    });

    await createAgentFetch()('/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.com/base/threads');
    expect(init?.credentials).toBe('omit');

    const headers = new Headers(init?.headers);
    expect(headers.get('cookie')).toBe('better-auth.session=token');
    expect(headers.get('expo-origin')).toBe('aiteamspace://');
    expect(headers.get('content-type')).toBe('application/json');
  });
});
