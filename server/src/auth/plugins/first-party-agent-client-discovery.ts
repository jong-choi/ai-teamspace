import { createHash } from 'node:crypto';

import type { McpConfig } from '@/mcp/config/mcp-config.type';
import { MCP_SCOPES } from '@/mcp/contracts/mcp-scope';

import type {
  ClientDiscovery,
  SchemaClient,
  Scope,
} from '@better-auth/oauth-provider';

const FIRST_PARTY_AGENT_CLIENT_DISCOVERY_ID = 'work-os-first-party-agent';

const OAUTH_CLIENT_ID_UNIQUE = 'oauth_client_client_id_unique';
const OAUTH_CLIENT_RESOURCE_UNIQUE =
  'oauthClientResource_clientId_resourceId_uidx';

type OAuthAdapter = Parameters<
  ClientDiscovery['resolve']
>[0]['context']['adapter'];
type OAuthWhere = NonNullable<Parameters<OAuthAdapter['findOne']>[0]['where']>;

/**
 * 서버 설정이 소유하는 first-party Agent OAuth client를 Better Auth에 제공한다.
 *
 * consent, token, resource link가 모두 `oauth_client` row를 FK로 참조하므로
 * client row와 canonical MCP resource link를 멱등하게 보장한 뒤, 설정 값을 저장된
 * row 위에 덮어써 secret rotation 같은 설정 변경을 즉시 반영한다.
 */
export function createFirstPartyAgentClientDiscovery(
  mcpConfig: McpConfig,
): ClientDiscovery {
  const { clientId, clientSecret, redirectUrl } = mcpConfig.agentDelegation;
  const configuredClient = {
    clientId,
    clientSecret: createHash('sha256')
      .update(clientSecret, 'utf8')
      .digest('base64url'),
    clientDiscoveryId: FIRST_PARTY_AGENT_CLIENT_DISCOVERY_ID,
    disabled: false,
    scopes: [...MCP_SCOPES, 'offline_access'],
    name: 'Work OS Agent',
    redirectUris: [redirectUrl],
    tokenEndpointAuthMethod: 'client_secret_basic',
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    applicationType: 'web',
    requirePKCE: true,
    skipConsent: false,
  } satisfies Partial<SchemaClient<Scope[]>>;

  return {
    id: FIRST_PARTY_AGENT_CLIENT_DISCOVERY_ID,
    matches: (candidate) => candidate === clientId,
    resolve: async (context, _clientId, existing) => {
      const adapter = context.context.adapter;
      const now = new Date();
      const storedClient =
        existing ??
        (await findOrCreate<SchemaClient<Scope[]>>(adapter, {
          model: 'oauthClient',
          where: [{ field: 'clientId', value: clientId }],
          data: { ...configuredClient, createdAt: now, updatedAt: now },
          uniqueConstraint: OAUTH_CLIENT_ID_UNIQUE,
        }));
      // 같은 client_id를 다른 경로로 등록한 row는 managed client로 취급하지 않는다.
      if (
        storedClient?.clientDiscoveryId !==
        FIRST_PARTY_AGENT_CLIENT_DISCOVERY_ID
      ) {
        return null;
      }

      await findOrCreate(adapter, {
        model: 'oauthClientResource',
        where: [
          { field: 'clientId', value: clientId },
          { field: 'resourceId', value: mcpConfig.resourceUrl },
        ],
        data: { clientId, resourceId: mcpConfig.resourceUrl, createdAt: now },
        uniqueConstraint: OAUTH_CLIENT_RESOURCE_UNIQUE,
      });

      return { ...storedClient, ...configuredClient };
    },
  };
}

/**
 * 동시 resolve가 같은 row를 만들면 unique 충돌 뒤 authoritative row를 다시 읽는다.
 * 다른 DB 오류는 invalid client로 숨기지 않고 그대로 전파한다.
 */
async function findOrCreate<T>(
  adapter: OAuthAdapter,
  input: {
    model: string;
    where: OAuthWhere;
    data: Record<string, unknown>;
    uniqueConstraint: string;
  },
): Promise<T | null> {
  const found = await adapter.findOne<T>({
    model: input.model,
    where: input.where,
  });
  if (found) return found;

  try {
    return await adapter.create<Record<string, unknown>, T>({
      model: input.model,
      data: input.data,
    });
  } catch (error) {
    if (!isUniqueViolation(error, input.uniqueConstraint)) throw error;
    return adapter.findOne<T>({ model: input.model, where: input.where });
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== 'object' || current === null) return false;
    if (
      'code' in current &&
      current.code === '23505' &&
      'constraint' in current &&
      current.constraint === constraint
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}
