import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';

export abstract class McpAccessKeyAuthenticator {
  abstract authenticate(secret: string): Promise<McpAuthContext>;
}
