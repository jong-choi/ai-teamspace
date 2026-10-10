import {
  MCP_SCOPES,
  type McpScope,
  normalizeMcpScopes,
  withoutPersonalMcpScopes,
  withPersonalMcpScopes,
} from '@/mcp/contracts/mcp-scope';

// 정책을 따로 저장하지 않은 조직과 사용자는 조회와 변경을 모두 허용한 상태로 시작한다.
export function getDefaultOrganizationMcpScopes(): McpScope[] {
  return withoutPersonalMcpScopes(MCP_SCOPES);
}

export function getDefaultUserMcpScopes(
  organizationAllowedScopes: readonly McpScope[],
): McpScope[] {
  return withPersonalMcpScopes(organizationAllowedScopes);
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
