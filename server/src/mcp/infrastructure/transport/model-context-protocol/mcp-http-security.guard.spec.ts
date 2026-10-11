import type { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import { McpHttpSecurityGuard } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-http-security.guard';

function createGuard() {
  return new McpHttpSecurityGuard({
    getOrThrow: () => ({
      resourceUrl: 'https://teamspace.example/mcp',
      resourceOrigin: 'https://teamspace.example',
      resourcePath: '/mcp',
      allowedHosts: ['teamspace.example'],
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
}

describe('MCP HTTP security guard', () => {
  it('허용된 Host와 Origin을 통과시킨다', () => {
    const request = new Request('https://teamspace.example/mcp', {
      headers: {
        host: 'teamspace.example',
        origin: 'https://dashboard.example',
      },
    });

    expect(createGuard().reject(request)).toBeUndefined();
  });

  it('Origin이 없는 non-browser MCP client를 허용한다', () => {
    const request = new Request('https://teamspace.example/mcp', {
      headers: { host: 'teamspace.example' },
    });

    expect(createGuard().reject(request)).toBeUndefined();
  });

  it('allowlist 밖 Host를 JSON-RPC 403으로 거부한다', async () => {
    const request = new Request('https://teamspace.example/mcp', {
      headers: { host: 'evil.example' },
    });

    const response = createGuard().reject(request);

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32_000 },
      id: null,
    });
  });

  it('allowlist 밖 browser Origin을 JSON-RPC 403으로 거부한다', () => {
    const request = new Request('https://teamspace.example/mcp', {
      headers: {
        host: 'teamspace.example',
        origin: 'https://evil.example',
      },
    });

    expect(createGuard().reject(request)?.status).toBe(403);
  });
});
