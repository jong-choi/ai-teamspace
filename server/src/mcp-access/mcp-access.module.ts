import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { McpAccessDrizzlePersistenceModule } from '@/mcp-access/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { McpAccessController } from '@/mcp-access/mcp-access.controller';
import { McpAccessService } from '@/mcp-access/mcp-access.service';
import { OrganizationsModule } from '@/organizations/organizations.module';

@Module({
  imports: [AuthModule, OrganizationsModule, McpAccessDrizzlePersistenceModule],
  controllers: [McpAccessController],
  providers: [McpAccessService, TrustedOriginGuard],
  exports: [McpAccessService],
})
export class McpAccessModule {}
