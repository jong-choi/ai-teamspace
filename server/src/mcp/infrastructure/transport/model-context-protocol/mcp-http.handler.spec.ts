import type { ConfigService } from '@nestjs/config';

import type { Auth } from '@/auth/auth';
import type { AllConfigType } from '@/config/config.type';
import { McpHttpHandler } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-http.handler';
import type { McpHttpSecurityGuard } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-http-security.guard';
import type { TeamspaceMcpServerFactory } from '@/mcp/mcp-server.factory';
import {
  McpAccessKeyAuthenticationError,
  McpAccessKeyRateLimitedError,
} from '@/mcp-access-keys/mcp-access-key.error';
import type { McpAccessKeyAuthenticator } from '@/mcp-access-keys/mcp-access-key-authenticator.provider';

import type { AuthService } from '@thallesp/nestjs-better-auth';

const config = {
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
};

describe('MCP HTTP credential routing', () => {
  const authenticate = jest.fn();
  const create = jest.fn();
  const reject = jest.fn();

  const authService = {
    instance: {
      $context: Promise.resolve({
        baseURL: 'https://workos.example/api/auth',
        internalAdapter: {},
      }),
    },
  } as unknown as AuthService<Auth>;

  const configService = {
    getOrThrow: () => config,
  } as unknown as ConfigService<AllConfigType>;

  const accessKeyAuthenticator = {
    authenticate,
  } as unknown as McpAccessKeyAuthenticator;

  const serverFactory = { create } as unknown as TeamspaceMcpServerFactory;
  const securityGuard = { reject } as unknown as McpHttpSecurityGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    reject.mockReturnValue(undefined);
  });

  it('Authorization과 X-API-Key가 동시에 있으면 verifier를 호출하지 않고 400으로 거부한다', async () => {
    const handler = new McpHttpHandler(
      authService,
      configService,
      serverFactory,
      securityGuard,
      accessKeyAuthenticator,
    );

    const response = await handler.fetch(
      new Request('https://workos.example/mcp', {
        method: 'POST',
        headers: {
          authorization: 'Bearer wos_mcp_secret',
          'x-api-key': 'wos_mcp_secret',
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(authenticate).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('invalid Personal Access Key는 OAuth fallback 없이 401 discovery challenge를 반환한다', async () => {
    authenticate.mockRejectedValue(new McpAccessKeyAuthenticationError());
    const handler = new McpHttpHandler(
      authService,
      configService,
      serverFactory,
      securityGuard,
      accessKeyAuthenticator,
    );

    const response = await handler.fetch(
      new Request('https://workos.example/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer wos_mcp_invalid' },
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://workos.example/.well-known/oauth-protected-resource/mcp"',
    );
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(authenticate).toHaveBeenCalledWith('wos_mcp_invalid');
    expect(create).not.toHaveBeenCalled();
  });

  it('Personal Access Key rate limit은 429와 Retry-After로 노출하고 OAuth fallback하지 않는다', async () => {
    authenticate.mockRejectedValue(new McpAccessKeyRateLimitedError(2_500));
    const handler = new McpHttpHandler(
      authService,
      configService,
      serverFactory,
      securityGuard,
      accessKeyAuthenticator,
    );

    const response = await handler.fetch(
      new Request('https://workos.example/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer wos_mcp_secret' },
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('3');
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('Host/Origin rejection이 credential verifier보다 먼저 실행된다', async () => {
    reject.mockReturnValue(
      Response.json({ error: 'blocked' }, { status: 403 }),
    );
    const handler = new McpHttpHandler(
      authService,
      configService,
      serverFactory,
      securityGuard,
      accessKeyAuthenticator,
    );

    const response = await handler.fetch(
      new Request('https://workos.example/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer wos_mcp_secret' },
      }),
    );

    expect(response.status).toBe(403);
    expect(authenticate).not.toHaveBeenCalled();
  });
});
