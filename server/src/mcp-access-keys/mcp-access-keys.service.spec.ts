import type { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import { MCP_SCOPES } from '@/mcp/contracts/mcp-scope';
import { McpAccessKeysService } from '@/mcp-access-keys/mcp-access-keys.service';

describe('MCP access key management service', () => {
  it('connection info는 canonical config와 scope vocabulary에서만 만든다', () => {
    const service = new McpAccessKeysService({
      getOrThrow: () => ({
        resourceUrl: 'https://workos.example/mcp',
        resourceOrigin: 'https://workos.example',
        resourcePath: '/mcp',
        allowedHosts: ['workos.example'],
        allowedOrigins: ['dashboard.example'],
        protocol: {
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
        },
      }),
    } as unknown as ConfigService<AllConfigType>);

    expect(service.getConnectionInfo()).toEqual({
      resourceUrl: 'https://workos.example/mcp',
      protocolVersion: '2026-07-28',
      authMethods: ['oauth', 'personal-access-key'],
      accessKey: {
        prefix: 'wos_mcp_',
        maxActiveKeys: 10,
        defaultExpiresInDays: 30,
        maxExpiresInDays: 365,
      },
      scopes: MCP_SCOPES,
    });
  });
});
