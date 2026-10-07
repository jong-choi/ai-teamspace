import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { LoggerMcpPolicyAuditPublisher } from '@/mcp-access/infrastructure/audit/logger-mcp-policy-audit.publisher';
import { McpPolicyAuditPublisher } from '@/mcp-access/infrastructure/audit/mcp-policy-audit.publisher';
import { McpAccessDrizzlePersistenceModule } from '@/mcp-access/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { McpAccessController } from '@/mcp-access/mcp-access.controller';
import { McpAccessService } from '@/mcp-access/mcp-access.service';
import { OrganizationsModule } from '@/organizations/organizations.module';

@Module({
  imports: [AuthModule, OrganizationsModule, McpAccessDrizzlePersistenceModule],
  controllers: [McpAccessController],
  providers: [
    McpAccessService,
    TrustedOriginGuard,
    {
      provide: McpPolicyAuditPublisher,
      useClass: LoggerMcpPolicyAuditPublisher,
    },
  ],
  exports: [McpAccessService],
})
export class McpAccessModule {}
