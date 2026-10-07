import { Module } from '@nestjs/common';

import { AgentMcpAuditPublisher } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.publisher';
import { LoggerAgentMcpAuditPublisher } from '@/agent-mcp-connections/infrastructure/audit/logger-agent-mcp-audit.publisher';

@Module({
  providers: [
    {
      provide: AgentMcpAuditPublisher,
      useClass: LoggerAgentMcpAuditPublisher,
    },
  ],
  exports: [AgentMcpAuditPublisher],
})
export class AgentMcpAuditModule {}
