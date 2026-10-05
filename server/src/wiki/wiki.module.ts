import { Module } from '@nestjs/common';

import { AuthModule } from '#server/auth/auth.module.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import { OrganizationsModule } from '#server/organizations/organizations.module.js';
import { WikiDrizzlePersistenceModule } from '#server/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module.js';
import { WikiController } from '#server/wiki/wiki.controller.js';
import { WikiService } from '#server/wiki/wiki.service.js';

@Module({
  imports: [AuthModule, OrganizationsModule, WikiDrizzlePersistenceModule],
  controllers: [WikiController],
  providers: [WikiService, TrustedOriginGuard],
})
export class WikiModule {}
