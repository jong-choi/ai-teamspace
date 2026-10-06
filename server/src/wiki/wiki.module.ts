import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { OrganizationsModule } from '@/organizations/organizations.module';
import { BetterAuthWikiCollaborationAuthorizationModule } from '@/wiki/infrastructure/collaboration/better-auth/better-auth-wiki-collaboration-authorization.module';
import { JoseWikiCollaborationTokenModule } from '@/wiki/infrastructure/collaboration/jose/jose-wiki-collaboration-token.module';
import { RedisWikiCollaborationAttributionModule } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-attribution.module';
import { RedisWikiCollaborationInvalidationPublisherModule } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation-publisher.module';
import { YjsWikiCollaborationStateModule } from '@/wiki/infrastructure/collaboration/yjs/yjs-wiki-collaboration-state.module';
import { WikiDrizzlePersistenceModule } from '@/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { WikiController } from '@/wiki/wiki.controller';
import { WikiService } from '@/wiki/wiki.service';
import { WikiCollaborationService } from '@/wiki/wiki-collaboration.service';

@Module({
  imports: [
    BetterAuthWikiCollaborationAuthorizationModule,
    ConfigModule,
    JoseWikiCollaborationTokenModule,
    OrganizationsModule,
    RedisWikiCollaborationAttributionModule,
    RedisWikiCollaborationInvalidationPublisherModule,
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
