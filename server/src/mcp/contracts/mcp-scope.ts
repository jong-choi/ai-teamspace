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
