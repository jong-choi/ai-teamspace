import {
  MCP_ACCESS_KEY_CONFIG_ID,
  MCP_ACCESS_KEY_PREFIX,
  MCP_CONSENT_PAGE,
  MCP_LOGIN_PAGE,
  createAuthOptions,
} from '@/auth/auth-options';
import type { McpConfig } from '@/mcp/config/mcp-config.type';

const mcpConfig: McpConfig = {
  resourceUrl: 'https://workos.example/mcp',
  resourceOrigin: 'https://workos.example',
  resourcePath: '/mcp',
  allowedHosts: ['workos.example'],
  allowedOrigins: ['workos.example'],
  protocol: {
    modernOnly: true,
    maxRequestBodyBytes: 104_857,
    maxToolInputElements: 1_000,
    requestTimeoutMs: 30_000,
  },
  accessKey: {
    defaultExpiresInDays: 30,
    maxExpiresInDays: 365,
    maxActivePerUser: 10,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 60,
    operationRetentionHours: 24,
    reservationStaleAfterSeconds: 300,
  },
  agentDelegation: {
    clientId: 'work-os-agent',
    clientSecret: 'replace-with-a-random-secret-of-at-least-32-characters',
    redirectUrl: 'https://workos.example/mcp/agent-delegation/callback',
    flowTtlSeconds: 600,
    refreshLeaseTtlSeconds: 15,
    refreshLeaseWaitMs: 5_000,
  },
};

describe('Better Auth MCP option factory', () => {
  it('JWT/MCP/CIMD/API-key plugin을 하나의 canonical graph에 추가한다', () => {
    const options = createAuthOptions(mcpConfig);

    expect(options.plugins.map((plugin) => plugin.id)).toEqual([
      'expo',
      'username',
      'organization',
      'jwt',
      'oauth-provider',
      'cimd',
      'api-key',
    ]);
  });

  it('MCP OAuth route와 canonical resource를 고정한다', () => {
    const options = createAuthOptions(mcpConfig);
    const oauthPlugin = options.plugins.find(
      (plugin) => plugin.id === 'oauth-provider',
    );

    expect(MCP_LOGIN_PAGE).toBe('/login');
    expect(MCP_CONSENT_PAGE).toBe('/settings/mcp/consent');
    expect(oauthPlugin).toBeDefined();
  });

  it('Personal MCP Access Key의 config ID와 prefix를 고정한다', () => {
    expect(MCP_ACCESS_KEY_CONFIG_ID).toBe('workos-mcp-user');
    expect(MCP_ACCESS_KEY_PREFIX).toBe('wos_mcp_');

    const apiKeyPlugin = createAuthOptions(mcpConfig).plugins.find(
      (plugin) => plugin.id === 'api-key',
    );
    expect(apiKeyPlugin).toBeDefined();
  });
});
