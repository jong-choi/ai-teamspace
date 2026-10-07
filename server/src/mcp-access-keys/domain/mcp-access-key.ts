import type { McpAccessKeyMetadata } from '@/mcp-access-keys/domain/mcp-access-key-contract';
import type { McpScope } from '@/mcp/contracts/mcp-scope';

export type McpAccessKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  start: string | null;
  enabled: boolean;
  expired: boolean;
  scopes: McpScope[];
  organizationGrant: McpAccessKeyMetadata['organizationGrant'];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type McpAccessKeySecretRecord = McpAccessKeyRecord & {
  secret: string;
};

export type CreateMcpAccessKeyProviderInput = {
  userId: string;
  name: string;
  scopes: readonly McpScope[];
  organizationGrant: McpAccessKeyMetadata['organizationGrant'];
  expiresInSeconds: number;
};

export type UpdateMcpAccessKeyProviderInput = {
  userId: string;
  keyId: string;
  name?: string;
  scopes?: readonly McpScope[];
  organizationGrant?: McpAccessKeyMetadata['organizationGrant'];
  enabled?: boolean;
  expiresInSeconds?: number;
};
