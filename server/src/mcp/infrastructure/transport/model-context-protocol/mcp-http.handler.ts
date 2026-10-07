import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { requireMcpAuth } from '@better-auth/mcp';
import { createResourceServerChallenge } from '@better-auth/oauth-provider';
import {
  createMcpHandler,
  type McpHttpHandler as SdkMcpHttpHandler,
} from '@modelcontextprotocol/server';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth';

import type { Auth } from '@/auth/auth';
import type { AllConfigType } from '@/config/config.type';
import {
  McpAccessKeyAuthenticationError,
  McpAccessKeyRateLimitedError,
} from '@/mcp-access-keys/mcp-access-key.error';
import { McpAccessKeyAuthenticator } from '@/mcp-access-keys/mcp-access-key-authenticator.provider';
import {
  mapApiKeyAuthInfo,
  mapVerifiedOAuthRequest,
} from '@/mcp/infrastructure/auth/better-auth/better-auth-mcp-auth.mapper';
import {
  McpCredentialExtractionError,
  extractMcpCredential,
} from '@/mcp/infrastructure/auth/mcp-credential.extractor';
import { McpHttpSecurityGuard } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-http-security.guard';
import { WorkOsMcpServerFactory } from '@/mcp/mcp-server.factory';

@Injectable()
export class McpHttpHandler {
  private readonly handler: Pick<SdkMcpHttpHandler, 'fetch'>;

  constructor(
    authService: AuthService<Auth>,
    configService: ConfigService<AllConfigType>,
    serverFactory: WorkOsMcpServerFactory,
    securityGuard: McpHttpSecurityGuard,
    accessKeyAuthenticator: McpAccessKeyAuthenticator,
  ) {
    const config = configService.getOrThrow('mcp', { infer: true });

    const coreHandler = createMcpHandler(
      ({ authInfo }) => {
        if (!authInfo) {
          throw new Error('검증된 MCP AuthInfo가 없습니다.');
        }
        return serverFactory.create(authInfo);
      },
      {
        legacy: 'reject',
        maxRequestBodySize: config.protocol.maxRequestBodyBytes,
      },
    );

    const protectedOAuthFetch = requireMcpAuth(
      authService.instance,
      async (request, claims) => {
        const mapped = mapVerifiedOAuthRequest(
          request,
          claims,
          config.resourceUrl,
        );
        return coreHandler.fetch(request, { authInfo: mapped.authInfo });
      },
      { resource: config.resourceUrl },
    );

    this.handler = {
      fetch: async (request) => {
        const rejected = securityGuard.reject(request);
        if (rejected) {
          return rejected;
        }

        let credential;
        try {
          credential = extractMcpCredential(request);
        } catch (error) {
          if (error instanceof McpCredentialExtractionError) {
            return invalidCredentialRequestResponse();
          }
          throw error;
        }

        if (credential.method !== 'api-key') {
          return protectedOAuthFetch(request);
        }

        try {
          const context = await accessKeyAuthenticator.authenticate(
            credential.secret,
          );
          const authInfo = mapApiKeyAuthInfo(
            credential.secret,
            context,
            config.resourceUrl,
          );
          return coreHandler.fetch(request, { authInfo });
        } catch (error) {
          if (error instanceof McpAccessKeyRateLimitedError) {
            return rateLimitedMcpResponse(error.retryAfterMs);
          }
          if (error instanceof McpAccessKeyAuthenticationError) {
            return unauthorizedMcpResponse(config.resourceUrl);
          }
          throw error;
        }
      },
    };
  }

  fetch(request: Request): Promise<Response> {
    return this.handler.fetch(request);
  }
}

function invalidCredentialRequestResponse(): Response {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32_000,
        message: 'MCP credential header가 올바르지 않습니다.',
      },
      id: null,
    },
    { status: 400 },
  );
}

function rateLimitedMcpResponse(retryAfterMs: number | null): Response {
  const headers = new Headers();
  if (retryAfterMs !== null) {
    headers.set(
      'Retry-After',
      String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
    );
  }

  return Response.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32_000,
        message: 'MCP access key 요청 한도를 초과했습니다.',
      },
      id: null,
    },
    { status: 429, headers },
  );
}

function unauthorizedMcpResponse(resourceUrl: string): Response {
  const challenge = createResourceServerChallenge(
    new APIError('UNAUTHORIZED', {
      message: '유효한 MCP credential이 아닙니다.',
    }),
    resourceUrl,
  );

  return Response.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32_000,
        message: challenge?.message ?? 'MCP 인증이 필요합니다.',
      },
      id: null,
    },
    {
      status: challenge?.statusCode ?? 401,
      headers: challenge?.headers,
    },
  );
}
