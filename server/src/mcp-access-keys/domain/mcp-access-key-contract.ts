import {
  type McpScope,
  McpScopeSchema,
  normalizeMcpScopes,
} from '@/mcp/contracts/mcp-scope';

import { z } from 'zod';

export const MCP_ACCESS_KEY_PREFIX = 'wos_mcp_';
// header를 보낼 수 없는 MCP client가 주소만으로 인증할 때 access key를 싣는 query parameter다.
export const MCP_ACCESS_KEY_URL_PARAMETER = 'wos_token';

const selectedOrganizationGrantSchema = z.object({
  mode: z.literal('selected'),
  organizationIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .overwrite((ids) => [...new Set(ids)].sort()),
});

const allUserOrganizationsGrantSchema = z.object({
  mode: z.literal('all-user-organizations'),
});

export const McpAccessKeyOrganizationGrantSchema = z.discriminatedUnion(
  'mode',
  [selectedOrganizationGrantSchema, allUserOrganizationsGrantSchema],
);

export const McpAccessKeyMetadataSchema = z
  .object({
    kind: z.literal('workos-mcp-user'),
    version: z.literal(1),
    organizationGrant: McpAccessKeyOrganizationGrantSchema,
  })
  .strict();

export type McpAccessKeyMetadata = z.infer<typeof McpAccessKeyMetadataSchema>;

export const McpAccessKeyScopeRequestSchema = z
  .array(McpScopeSchema)
  .min(1)
  .overwrite((scopes) => normalizeMcpScopes(scopes));

const permissionMapSchema = z.record(
  z.string().trim().min(1),
  z.array(z.string().trim().min(1)).min(1),
);

export function scopesToPermissionMap(
  scopes: readonly McpScope[],
): Record<string, string[]> {
  const normalized = normalizeMcpScopes(scopes);
  if (normalized.length === 0) {
    throw new Error('MCP access key scope는 하나 이상이어야 합니다.');
  }

  const permissions = new Map<string, string[]>();
  for (const scope of normalized) {
    const separator = scope.indexOf(':');
    const resource = scope.slice(0, separator);
    const action = scope.slice(separator + 1);
    const actions = permissions.get(resource) ?? [];
    actions.push(action);
    permissions.set(resource, actions);
  }

  return Object.fromEntries(permissions);
}

export function permissionMapToScopes(value: unknown): McpScope[] {
  const permissions = permissionMapSchema.parse(value);
  const scopes: string[] = [];

  for (const [resource, actions] of Object.entries(permissions)) {
    for (const action of actions) {
      scopes.push(resource + ':' + action);
    }
  }

  if (scopes.length === 0) {
    throw new Error('MCP access key permission은 비어 있을 수 없습니다.');
  }

  return normalizeMcpScopes(scopes);
}

export function grantToAllowedOrganizationIds(
  metadata: McpAccessKeyMetadata,
): string[] | null {
  return metadata.organizationGrant.mode === 'selected'
    ? metadata.organizationGrant.organizationIds
    : null;
}
