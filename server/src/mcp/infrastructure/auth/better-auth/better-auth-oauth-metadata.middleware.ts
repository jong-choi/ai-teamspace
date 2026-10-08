import type { IncomingMessage, ServerResponse } from 'node:http';

import { Injectable, type NestMiddleware, RequestMethod } from '@nestjs/common';

import type { Auth } from '@/auth/auth';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { toNodeHandler } from 'better-auth/node';

/**
 * MCP client가 origin root에서 찾는 OAuth discovery 문서 경로다.
 * RFC 9728 protected resource metadata와 RFC 8414 authorization server metadata는
 * resource/issuer path를 well-known 뒤에 붙이는 path insertion 방식을 사용한다.
 */
export function oauthMetadataRoutes(input: {
  resourcePath: string;
  authBasePath: string;
}) {
  const paths = [
    '/.well-known/oauth-protected-resource',
    `/.well-known/oauth-protected-resource${input.resourcePath}`,
    `/.well-known/oauth-authorization-server${input.authBasePath}`,
  ];
  return paths.flatMap((path) => [
    { path, method: RequestMethod.GET },
    { path, method: RequestMethod.HEAD },
  ]);
}

/**
 * Better Auth handler는 `/api/auth` 아래에만 mount되므로 root discovery 요청을 그대로 넘긴다.
 * 문서 내용은 Better Auth MCP/OAuth provider plugin이 생성한다.
 */
@Injectable()
export class BetterAuthOAuthMetadataMiddleware implements NestMiddleware {
  private readonly authHandler: ReturnType<typeof toNodeHandler>;

  constructor(authService: AuthService<Auth>) {
    this.authHandler = toNodeHandler(authService.instance);
  }

  use(
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ): void {
    this.authHandler(request, response).catch(next);
  }
}
