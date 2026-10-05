import { Module } from '@nestjs/common';

import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import { OrganizationsModule } from '#server/organizations/organizations.module.js';
import { BetterAuthWikiCollaborationAuthorizationModule } from '#server/wiki/infrastructure/collaboration/better-auth/better-auth-wiki-collaboration-authorization.module.js';
import { JoseWikiCollaborationTokenModule } from '#server/wiki/infrastructure/collaboration/jose/jose-wiki-collaboration-token.module.js';
import { RedisWikiCollaborationAttributionModule } from '#server/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-attribution.module.js';
import { RedisWikiCollaborationInvalidationPublisherModule } from '#server/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation-publisher.module.js';
import { WikiCollaborationConfigurationModule } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-configuration.module.js';
import { YjsWikiCollaborationStateModule } from '#server/wiki/infrastructure/collaboration/yjs/yjs-wiki-collaboration-state.module.js';
import { WikiDrizzlePersistenceModule } from '#server/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module.js';
import { WikiController } from '#server/wiki/wiki.controller.js';
import { WikiService } from '#server/wiki/wiki.service.js';
import { WikiCollaborationService } from '#server/wiki/wiki-collaboration.service.js';

@Module({
  imports: [
    BetterAuthWikiCollaborationAuthorizationModule,
    JoseWikiCollaborationTokenModule,
    OrganizationsModule,
    RedisWikiCollaborationAttributionModule,
    RedisWikiCollaborationInvalidationPublisherModule,
    WikiCollaborationConfigurationModule,
    WikiDrizzlePersistenceModule,
    YjsWikiCollaborationStateModule,
  ],
  controllers: [WikiController],
  providers: [WikiService, WikiCollaborationService, TrustedOriginGuard],
  exports: [
    WikiService,
    WikiCollaborationService,
    YjsWikiCollaborationStateModule,
  ],
})
export class WikiModule {}
