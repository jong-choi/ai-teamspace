import type { McpConfig } from '@/mcp/config/mcp-config.type';
import { MCP_SCOPES } from '@/mcp/contracts/mcp-scope';
import { MCP_ACCESS_KEY_PREFIX } from '@/mcp-access-keys/domain/mcp-access-key-contract';

import { apiKey } from '@better-auth/api-key';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { expo } from '@better-auth/expo';
import { mcp } from '@better-auth/mcp';
import type { BetterAuthOptions } from 'better-auth';
import { jwt, organization, username } from 'better-auth/plugins';

export const organizationPlugin = organization();

export const organizationFacadeEndpoints = Object.values(
  organizationPlugin.endpoints,
);

export const organizationFacadeDisabledPaths = organizationFacadeEndpoints.map(
  (endpoint) => endpoint.path,
);

export const authOptions = {
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: true,
  },
  plugins: [expo(), username(), organizationPlugin],
} as const satisfies BetterAuthOptions;

export const MCP_LOGIN_PAGE = '/login';
export const MCP_CONSENT_PAGE = '/settings/mcp/consent';
export const MCP_ACCESS_KEY_CONFIG_ID = 'workos-mcp-user';

export const mcpAccessKeyFacadeDisabledPaths = [
  '/api-key/create',
  '/api-key/get',
  '/api-key/update',
  '/api-key/delete',
  '/api-key/list',
] as const;

export function createAuthOptions(mcpConfig: McpConfig) {
  return {
    ...authOptions,
    plugins: [
      ...authOptions.plugins,
      jwt(),
      mcp({
        loginPage: MCP_LOGIN_PAGE,
        consentPage: MCP_CONSENT_PAGE,
        resource: mcpConfig.resourceUrl,
        scopes: [...MCP_SCOPES, 'offline_access'],
      }),
      cimd({
        fetchClientMetadataResource,
        metadataProfile: 'mcp-2026-07-28',
      }),
      apiKey({
        configId: MCP_ACCESS_KEY_CONFIG_ID,
        references: 'user',
        defaultPrefix: MCP_ACCESS_KEY_PREFIX,
        requireName: true,
        enableMetadata: true,
        enableSessionForAPIKeys: false,
        permissions: { defaultPermissions: {} },
        rateLimit: {
          enabled: true,
          timeWindow: mcpConfig.accessKey.rateLimitWindowMs,
          maxRequests: mcpConfig.accessKey.rateLimitMax,
        },
        keyExpiration: {
          defaultExpiresIn:
            mcpConfig.accessKey.defaultExpiresInDays * 24 * 60 * 60,
          disableCustomExpiresTime: false,
          // 사용자 만료 하한은 AI Teamspace DTO가 검증한다. rotate는 남은 수명(하루 미만 포함)을 초 단위로 넘기므로 막지 않는다.
          minExpiresIn: 0,
          maxExpiresIn: mcpConfig.accessKey.maxExpiresInDays,
        },
      }),
    ],
  } satisfies BetterAuthOptions;
}
