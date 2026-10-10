import { z } from 'zod';

export const MCP_SCOPES = [
  'organizations:read',
  'organizations:write',
  'chat:read',
  'chat:write',
  'wiki:read',
  'wiki:write',
  'projects:read',
  'projects:write',
  'calendar:read',
  'calendar:write',
] as const;

// 조직에 속하지 않는 자원의 scope다. 조직 정책과 무관하게 사용자 본인만 켜고 끈다.
export const MCP_PERSONAL_SCOPES = [
  'chat:read',
  'chat:write',
] as const satisfies readonly (typeof MCP_SCOPES)[number][];

export const McpScopeSchema = z.enum(MCP_SCOPES);

export type McpScope = z.infer<typeof McpScopeSchema>;

const scopeOrder = new Map<McpScope, number>(
  MCP_SCOPES.map((scope, index) => [scope, index]),
);

export const McpScopesSchema = z
  .array(McpScopeSchema)
  .overwrite((scopes) => normalizeMcpScopes(scopes));

export function normalizeMcpScopes(scopes: readonly string[]): McpScope[] {
  const parsedScopes = scopes.map((scope) => McpScopeSchema.parse(scope));
  return [...new Set(parsedScopes)].sort(
    (left, right) => scopeOrder.get(left)! - scopeOrder.get(right)!,
  );
}

export function isPersonalMcpScope(scope: McpScope): boolean {
  return MCP_PERSONAL_SCOPES.some((personal) => personal === scope);
}

// 조직 정책에 개인 scope를 더한, 사용자가 고를 수 있는 전체 범위다.
export function withPersonalMcpScopes(
  organizationAllowedScopes: readonly McpScope[],
): McpScope[] {
  return normalizeMcpScopes([
    ...organizationAllowedScopes,
    ...MCP_PERSONAL_SCOPES,
  ]);
}

// 조직 정책으로 저장할 수 있는 scope만 남긴다.
export function withoutPersonalMcpScopes(
  scopes: readonly McpScope[],
): McpScope[] {
  return scopes.filter((scope) => !isPersonalMcpScope(scope));
}
