import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { BetterAuthMcpAccessKeyModule } from '@/mcp-access-keys/infrastructure/access-key/better-auth/better-auth-mcp-access-key.module';
import { BetterAuthMcpAccessKeyAuthenticatorModule } from '@/mcp-access-keys/infrastructure/better-auth/better-auth-mcp-access-key-authenticator.module';
import { McpAccessKeyDrizzlePersistenceModule } from '@/mcp-access-keys/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { McpAccessKeyLifecycleService } from '@/mcp-access-keys/mcp-access-key-lifecycle.service';
import { McpAccessKeyReconciliationService } from '@/mcp-access-keys/mcp-access-key-reconciliation.service';
import { McpAccessKeysController } from '@/mcp-access-keys/mcp-access-keys.controller';
import { McpAccessKeysService } from '@/mcp-access-keys/mcp-access-keys.service';
import { OrganizationsModule } from '@/organizations/organizations.module';

@Module({
  imports: [
    AuthModule,
    BetterAuthMcpAccessKeyAuthenticatorModule,
    BetterAuthMcpAccessKeyModule,
    McpAccessKeyDrizzlePersistenceModule,
    OrganizationsModule,
  ],
  controllers: [McpAccessKeysController],
  providers: [
    McpAccessKeyLifecycleService,
    McpAccessKeyReconciliationService,
    McpAccessKeysService,
    TrustedOriginGuard,
  ],
  exports: [
    BetterAuthMcpAccessKeyAuthenticatorModule,
    McpAccessKeyLifecycleService,
    McpAccessKeyReconciliationService,
    McpAccessKeysService,
  ],
})
export class McpAccessKeysModule {}
