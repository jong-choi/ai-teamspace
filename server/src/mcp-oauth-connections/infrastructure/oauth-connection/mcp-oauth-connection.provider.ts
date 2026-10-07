import type { McpOAuthConnection } from '@/mcp-oauth-connections/domain/mcp-oauth-connection';

export abstract class McpOAuthConnectionProvider {
  abstract listForUser(userId: string): Promise<McpOAuthConnection[]>;

  abstract revokeForUser(userId: string, consentId: string): Promise<boolean>;
}
