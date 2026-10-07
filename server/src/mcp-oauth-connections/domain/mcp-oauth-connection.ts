import type { McpScope } from '@/mcp/contracts/mcp-scope';

export type McpOAuthConnection = {
  consentId: string;
  clientId: string;
  displayName: string;
  applicationType: 'web' | 'native' | null;
  publicClient: boolean;
  scopes: McpScope[];
  createdAt: string;
  updatedAt: string;
  status: 'approved';
};
