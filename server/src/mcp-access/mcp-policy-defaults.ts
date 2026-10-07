import {
  MCP_SCOPES,
  type McpScope,
  normalizeMcpScopes,
} from '@/mcp/contracts/mcp-scope';

export function getDefaultOrganizationMcpScopes(): McpScope[] {
  return MCP_SCOPES.filter(isReadScope);
}

export function getDefaultUserMcpScopes(
  organizationAllowedScopes: readonly McpScope[],
): McpScope[] {
  const allowed = new Set(organizationAllowedScopes);
  return getDefaultOrganizationMcpScopes().filter((scope) =>
    allowed.has(scope),
  );
}

export function intersectMcpScopes(
  ...scopeSets: readonly (readonly McpScope[])[]
): McpScope[] {
  if (scopeSets.length === 0) return [];

  const [first, ...rest] = scopeSets;
  return normalizeMcpScopes(
    first.filter((scope) => rest.every((set) => set.includes(scope))),
  );
}

function isReadScope(scope: McpScope): boolean {
  return scope.endsWith(':read');
}
