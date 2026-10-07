import {
  type McpAuthContext,
  McpAuthContextSchema,
} from '@/mcp/contracts/mcp-auth-context';
import { normalizeMcpScopes } from '@/mcp/contracts/mcp-scope';

import type { AuthInfo } from '@modelcontextprotocol/server';
import { z } from 'zod';

const oauthClaimsSchema = z
  .object({
    sub: z.string().trim().min(1),
    client_id: z.string().trim().min(1).optional(),
    azp: z.string().trim().min(1).optional(),
    scope: z.string().trim().min(1),
    jti: z.string().trim().min(1).optional(),
    exp: z.number().int().positive().optional(),
  })
  .superRefine((claims, context) => {
    if (!claims.client_id && !claims.azp) {
      context.addIssue({
        code: 'custom',
        message: 'OAuth access token에 client identity가 없습니다.',
      });
    }

    if (claims.client_id && claims.azp && claims.client_id !== claims.azp) {
      context.addIssue({
        code: 'custom',
        message: 'OAuth access token의 client identity가 일치하지 않습니다.',
      });
    }
  });

const bearerAuthorizationSchema = z
  .string()
  .regex(/^Bearer [^\s]+$/, '검증된 OAuth bearer token을 찾을 수 없습니다.');

export type MappedOAuthAuth = {
  authInfo: AuthInfo;
  context: McpAuthContext;
};

export function mapVerifiedOAuthRequest(
  request: Request,
  claims: Record<string, unknown>,
  resourceUrl: string,
): MappedOAuthAuth {
  const parsedClaims = oauthClaimsSchema.parse(claims);
  const rawAuthorization = request.headers.get('authorization');
  if (!rawAuthorization) {
    throw new Error('검증된 OAuth bearer token을 찾을 수 없습니다.');
  }
  const authorization = bearerAuthorizationSchema.parse(rawAuthorization);
  const token = authorization.slice('Bearer '.length);
  const clientId = parsedClaims.client_id ?? parsedClaims.azp;
  if (!clientId) {
    throw new Error('검증된 OAuth client identity가 없습니다.');
  }

  const scopes = normalizeMcpScopes(
    parsedClaims.scope
      .split(/\s+/)
      .filter(Boolean)
      .filter((scope) => scope !== 'offline_access'),
  );
  const context = McpAuthContextSchema.parse({
    authMethod: 'oauth',
    credentialId: parsedClaims.jti ?? null,
    userId: parsedClaims.sub,
    clientId,
    scopes,
    allowedOrganizationIds: null,
  });

  return {
    context,
    authInfo: {
      token,
      clientId,
      scopes,
      expiresAt: parsedClaims.exp,
      resource: new URL(resourceUrl),
      extra: {
        mcpAuthContext: context,
      },
    },
  };
}

export function mapApiKeyAuthInfo(
  secret: string,
  context: McpAuthContext,
  resourceUrl: string,
): AuthInfo {
  if (context.authMethod !== 'api-key' || !context.credentialId) {
    throw new Error(
      'API key AuthInfo에는 verified API key context가 필요합니다.',
    );
  }

  return {
    token: secret,
    clientId: `personal-access-key:${context.credentialId}`,
    scopes: context.scopes,
    resource: new URL(resourceUrl),
    extra: {
      mcpAuthContext: context,
    },
  };
}

export function getMcpAuthContext(authInfo: AuthInfo): McpAuthContext {
  return McpAuthContextSchema.parse(authInfo.extra?.mcpAuthContext);
}
