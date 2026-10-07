import {
  getApiCredentials,
  getApiFetch,
  getApiHeaders,
  getApiUrl,
  getProblemDetails,
} from '@repo/client/api-client/runtime';
import {
  MCP_ACCESS_SCOPES,
  type McpAccessComposite,
  McpAccessCompositeSchema,
  type McpAccessScope,
} from '@core/features/mcp-access/mcp-access-contract';

export type McpAccessPolicyUpdate = {
  scopes: McpAccessScope[];
  expectedRevision: number;
};

export interface McpAccessTransport {
  getComposite(organizationId: string): Promise<McpAccessComposite>;
  updateMyPolicy(
    organizationId: string,
    input: McpAccessPolicyUpdate,
  ): Promise<McpAccessComposite>;
  updateOrganizationPolicy(
    organizationId: string,
    input: McpAccessPolicyUpdate,
  ): Promise<McpAccessComposite>;
}

export function getMcpAccessTransport(): McpAccessTransport {
  return process.env.EXPO_PUBLIC_MCP_ACCESS_MOCK === '1'
    ? mockMcpAccessTransport
    : restMcpAccessTransport;
}

export const restMcpAccessTransport: McpAccessTransport = {
  getComposite: (organizationId) =>
    requestComposite(
      '/api/organizations/' +
        encodeURIComponent(organizationId) +
        '/mcp-access',
    ),
  updateMyPolicy: (organizationId, input) =>
    requestComposite(
      '/api/organizations/' +
        encodeURIComponent(organizationId) +
        '/mcp-access/me',
      {
        method: 'PATCH',
        body: JSON.stringify({
          requestedScopes: input.scopes,
          expectedRevision: input.expectedRevision,
        }),
      },
    ),
  updateOrganizationPolicy: (organizationId, input) =>
    requestComposite(
      '/api/organizations/' +
        encodeURIComponent(organizationId) +
        '/mcp-access/organization-policy',
      {
        method: 'PATCH',
        body: JSON.stringify({
          allowedScopes: input.scopes,
          expectedRevision: input.expectedRevision,
        }),
      },
    ),
};

async function requestComposite(
  path: string,
  init: RequestInit = {},
): Promise<McpAccessComposite> {
  const response = await getApiFetch()(getApiUrl(path), {
    ...init,
    credentials: init.credentials ?? getApiCredentials(),
    headers: await getApiHeaders({
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    }),
  });
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const problem = getProblemDetails(body);
    if (problem) throw problem;
    throw new Error('MCP access request failed (' + response.status + ').');
  }

  return McpAccessCompositeSchema.parse(body);
}

const mockStates = new Map<string, McpAccessComposite>();

export const mockMcpAccessTransport: McpAccessTransport = {
  async getComposite(organizationId) {
    return structuredClone(getMockState(organizationId));
  },
  async updateMyPolicy(organizationId, input) {
    const state = getMockState(organizationId);
    if (input.expectedRevision !== state.myPolicy.revision) {
      throw mockRevisionConflict();
    }

    state.myPolicy = {
      requestedScopes: normalize(input.scopes).filter((scope) =>
        state.organizationPolicy.allowedScopes.includes(scope),
      ),
      revision: state.myPolicy.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    refreshMockCapabilities(state);
    return structuredClone(state);
  },
  async updateOrganizationPolicy(organizationId, input) {
    const state = getMockState(organizationId);
    if (input.expectedRevision !== state.organizationPolicy.revision) {
      throw mockRevisionConflict();
    }

    const allowed = normalize(input.scopes);
    state.organizationPolicy = {
      allowedScopes: allowed,
      revision: state.organizationPolicy.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    state.myPolicy = {
      ...state.myPolicy,
      requestedScopes: state.myPolicy.requestedScopes.filter((scope) =>
        allowed.includes(scope),
      ),
      revision: state.myPolicy.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    refreshMockCapabilities(state);
    return structuredClone(state);
  },
};

function getMockState(organizationId: string): McpAccessComposite {
  const existing = mockStates.get(organizationId);
  if (existing) return existing;

  const readScopes = MCP_ACCESS_SCOPES.filter((scope) =>
    scope.endsWith(':read'),
  );
  const state: McpAccessComposite = {
    organizationId,
    organizationPolicy: {
      allowedScopes: [...readScopes],
      revision: 0,
      updatedAt: new Date().toISOString(),
    },
    myPolicy: {
      requestedScopes: [...readScopes],
      revision: 0,
      updatedAt: new Date().toISOString(),
    },
    effectiveScopes: [...readScopes],
    canManageOrganizationPolicy: true,
    capabilities: [],
  };
  refreshMockCapabilities(state);
  mockStates.set(organizationId, state);
  return state;
}

function refreshMockCapabilities(state: McpAccessComposite): void {
  const organizationAllowed = new Set(state.organizationPolicy.allowedScopes);
  const requested = new Set(state.myPolicy.requestedScopes);

  state.capabilities = MCP_ACCESS_SCOPES.map((scope) => {
    const organizationAllows = organizationAllowed.has(scope);
    const userRequests = requested.has(scope);
    return {
      scope,
      feature: scope.slice(0, scope.lastIndexOf(':')),
      action: scope.endsWith(':write') ? ('write' as const) : ('read' as const),
      requested: userRequests,
      organizationAllowed: organizationAllows,
      effective: organizationAllows && userRequests,
      restrictionReason: !organizationAllows
        ? ('organization_policy' as const)
        : !userRequests
          ? ('user_policy' as const)
          : null,
    };
  });
  state.effectiveScopes = state.capabilities
    .filter((capability) => capability.effective)
    .map((capability) => capability.scope);
}

function normalize(scopes: readonly McpAccessScope[]): McpAccessScope[] {
  return MCP_ACCESS_SCOPES.filter((scope) => scopes.includes(scope));
}

function mockRevisionConflict() {
  return {
    type: 'about:blank',
    title: 'MCP policy revision conflict',
    status: 409,
    errorCode: 'MCP_POLICY_REVISION_CONFLICT',
  };
}
