import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { McpAgentDelegationDrizzleRepository } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/repositories/mcp-agent-delegation.repository';
import { McpAgentOauthFlowDrizzleRepository } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/repositories/mcp-agent-oauth-flow.repository';
import { McpAgentDelegationRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-delegation.repository';
import { McpAgentOauthFlowRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-oauth-flow.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: McpAgentDelegationRepository,
      useClass: McpAgentDelegationDrizzleRepository,
    },
    {
      provide: McpAgentOauthFlowRepository,
      useClass: McpAgentOauthFlowDrizzleRepository,
    },
  ],
  exports: [McpAgentDelegationRepository, McpAgentOauthFlowRepository],
})
export class McpAgentDelegationDrizzlePersistenceModule {}
