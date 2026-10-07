import { Module } from '@nestjs/common';

import { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import { AgentMcpConnectionDrizzleRepository } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/agent-mcp-connection-drizzle.repository';

@Module({
  providers: [
    {
      provide: AgentMcpConnectionRepository,
      useClass: AgentMcpConnectionDrizzleRepository,
    },
  ],
  exports: [AgentMcpConnectionRepository],
})
export class AgentMcpConnectionPersistenceModule {}
