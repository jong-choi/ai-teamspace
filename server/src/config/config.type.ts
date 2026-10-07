import type { AgentConfig } from '@/agent/config/agent-config.type';
import type { AgentMcpConnectionsConfig } from '@/agent-mcp-connections/config/agent-mcp-connections-config.type';
import type { AuthConfig } from '@/auth/config/auth-config.type';
import type { CacheConfig } from '@/chat/config/cache-config.type';
import type { AppConfig } from '@/config/app-config.type';
import type { CredentialCryptoConfig } from '@/credential-crypto/config/credential-crypto-config.type';
import type { DatabaseConfig } from '@/database/config/database-config.type';
import type { McpConfig } from '@/mcp/config/mcp-config.type';
import type { QueueConfig } from '@/queue/config/queue-config.type';
import type { CollaborationConfig } from '@/wiki/infrastructure/collaboration/config/collaboration-config.type';

export type AllConfigType = {
  agent: AgentConfig;
  agentMcpConnections: AgentMcpConnectionsConfig;
  app: AppConfig;
  auth: AuthConfig;
  cache: CacheConfig;
  collaboration: CollaborationConfig;
  credentialCrypto: CredentialCryptoConfig;
  database: DatabaseConfig;
  mcp: McpConfig;
  queue: QueueConfig;
};
