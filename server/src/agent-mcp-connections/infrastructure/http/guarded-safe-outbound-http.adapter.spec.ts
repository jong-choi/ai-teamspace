import dns from 'node:dns';

import type { AgentMcpConnectionsConfig } from '@/agent-mcp-connections/config/agent-mcp-connections-config.type';
import { GuardedSafeOutboundHttpAdapter } from '@/agent-mcp-connections/infrastructure/http/guarded-safe-outbound-http.adapter';

import {
  createGuardedLookup,
  GuardedFetchErrorCode,
  isGuardedFetchError,
} from 'guarded-fetch';

describe('external MCP SafeOutboundHttp', () => {
  function config(allowPrivateNetworks = false): AgentMcpConnectionsConfig {
    return {
      oauthCallbackUrl: 'http://localhost:3100/agent/mcp/oauth/callback',
      connectTimeoutMs: 10_000,
      toolTimeoutMs: 30_000,
      maxResponseBytes: 1_048_576,
      maxToolsPerConnection: 100,
      maxConnectionsPerUser: 10,
      allowPrivateNetworks,
    };
  }

  test('production 기본 정책은 loopback IP literal을 차단한다', async () => {
    const adapter = new GuardedSafeOutboundHttpAdapter(config());

    let failure: unknown;
    try {
      await adapter.assertSafe('https://127.0.0.1/mcp');
    } catch (error) {
      failure = error;
    }

    expect(isGuardedFetchError(failure)).toBe(true);
    if (!isGuardedFetchError(failure)) {
      throw new Error('GuardedFetchError가 필요합니다.');
    }
    expect(failure.code).toBe(GuardedFetchErrorCode.HOSTNAME_UNSAFE);
  });

  test.each([
    'https://[::1]/mcp',
    'https://[::ffff:127.0.0.1]/mcp',
    'https://2130706433/mcp',
    'https://0x7f000001/mcp',
    'https://0177.0.0.1/mcp',
  ])(
    'IP 표현 우회 %s 도 private destination으로 거부한다',
    async (endpoint) => {
      const adapter = new GuardedSafeOutboundHttpAdapter(config());

      await expect(adapter.assertSafe(endpoint)).rejects.toMatchObject({
        code: GuardedFetchErrorCode.HOSTNAME_UNSAFE,
      });
    },
  );

  test('socket lookup 시점에 private IP로 바뀐 DNS rebinding을 차단한다', async () => {
    const lookup = jest.spyOn(dns, 'lookup').mockImplementation(((
      _hostname: string,
      _options: unknown,
      callback: (
        error: NodeJS.ErrnoException | null,
        address: string,
        family: number,
      ) => void,
    ) => {
      callback(null, '127.0.0.1', 4);
    }) as unknown as typeof dns.lookup);
    const guardedLookup = createGuardedLookup({ opaqueErrors: true });

    try {
      const error = await new Promise<NodeJS.ErrnoException | null>(
        (resolve) => {
          guardedLookup('rebind.example', { all: false }, (failure) =>
            resolve(failure),
          );
        },
      );

      expect(error).toMatchObject({
        name: 'GuardedFetchError',
        code: GuardedFetchErrorCode.HOSTNAME_UNSAFE,
      });
    } finally {
      lookup.mockRestore();
    }
  });

  test('HTTP endpoint는 private-network override와 무관하게 거부한다', async () => {
    const adapter = new GuardedSafeOutboundHttpAdapter(config(true));

    await expect(
      adapter.assertSafe('http://127.0.0.1/mcp'),
    ).rejects.toMatchObject({
      code: GuardedFetchErrorCode.PROTOCOL_NOT_ALLOWED,
    });
  });

  test('명시적인 non-production private-network override는 같은 host 검증을 통과한다', async () => {
    const adapter = new GuardedSafeOutboundHttpAdapter(config(true));

    await expect(
      adapter.assertSafe('https://127.0.0.1/custom/mcp'),
    ).resolves.toEqual(new URL('https://127.0.0.1/custom/mcp'));
  });
});
