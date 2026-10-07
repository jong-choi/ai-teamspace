import { createHash } from 'node:crypto';

import type { McpConfig } from '@/mcp/config/mcp-config.type';
import { MCP_SCOPES } from '@/mcp/contracts/mcp-scope';

import { apiKey } from '@better-auth/api-key';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { expo } from '@better-auth/expo';
import { mcp } from '@better-auth/mcp';
import type { ClientDiscovery } from '@better-auth/oauth-provider';
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
  plugins: [
    expo(),
    username({
      immutableUsername: true,
    }),
    organizationPlugin,
  ],
} as const satisfies BetterAuthOptions;

export const MCP_LOGIN_PAGE = '/login';
export const MCP_CONSENT_PAGE = '/settings/mcp/consent';
export const MCP_ACCESS_KEY_CONFIG_ID = 'workos-mcp-user';
export const MCP_ACCESS_KEY_PREFIX = 'wos_mcp_';

export const mcpAccessKeyFacadeDisabledPaths = [
  '/api-key/create',
  '/api-key/get',
  '/api-key/update',
  '/api-key/delete',
  '/api-key/list',
] as const;

const FIRST_PARTY_AGENT_CLIENT_DISCOVERY_ID = 'work-os-first-party-agent';

function createFirstPartyAgentClientDiscovery(
  mcpConfig: McpConfig,
): ClientDiscovery {
  const storedSecret = createHash('sha256')
    .update(mcpConfig.agentDelegation.clientSecret, 'utf8')
    .digest('base64url');

  return {
    id: FIRST_PARTY_AGENT_CLIENT_DISCOVERY_ID,
    matches: (clientId) => clientId === mcpConfig.agentDelegation.clientId,
    resolve: async (_context, clientId, existing) => {
      if (clientId !== mcpConfig.agentDelegation.clientId) {
        return null;
      }
      if (
        existing?.clientDiscoveryId &&
        existing.clientDiscoveryId !== FIRST_PARTY_AGENT_CLIENT_DISCOVERY_ID
      ) {
        return null;
      }

      return {
        clientId,
        clientSecret: storedSecret,
        clientDiscoveryId: FIRST_PARTY_AGENT_CLIENT_DISCOVERY_ID,
        disabled: false,
        scopes: [...MCP_SCOPES, 'offline_access'],
        name: 'Work OS Agent',
        redirectUris: [mcpConfig.agentDelegation.redirectUrl],
        tokenEndpointAuthMethod: 'client_secret_basic',
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        applicationType: 'web',
        requirePKCE: true,
        skipConsent: false,
      };
    },
  };
}

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
        extensions: [
          {
            clientDiscovery: createFirstPartyAgentClientDiscovery(mcpConfig),
          },
        ],
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
          minExpiresIn: 1,
          maxExpiresIn: mcpConfig.accessKey.maxExpiresInDays,
        },
      }),
    ],
  } satisfies BetterAuthOptions;
}
