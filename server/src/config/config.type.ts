import type { AgentConfig } from '@/agent/config/agent-config.type';
import type { AuthConfig } from '@/auth/config/auth-config.type';
import type { CacheConfig } from '@/chat/config/cache-config.type';
import type { AppConfig } from '@/config/app-config.type';
import type { DatabaseConfig } from '@/database/config/database-config.type';
import type { QueueConfig } from '@/queue/config/queue-config.type';
import type { CollaborationConfig } from '@/wiki/infrastructure/collaboration/config/collaboration-config.type';

export type AllConfigType = {
  agent: AgentConfig;
  app: AppConfig;
  auth: AuthConfig;
  cache: CacheConfig;
  collaboration: CollaborationConfig;
  database: DatabaseConfig;
  queue: QueueConfig;
};
