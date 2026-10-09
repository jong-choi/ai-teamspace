import { Module } from '@nestjs/common';

import { AuthMembershipLockModule } from '@/auth/auth-membership-lock.module';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { WorkosGraphSourceAccessAdapter } from '@/knowledge-graph/infrastructure/source-access/workos/workos-graph-source-access.adapter';
import { OrganizationsModule } from '@/organizations/organizations.module';
import { WikiReferenceLockQueryModule } from '@/wiki/wiki-reference-lock-query.module';

@Module({
  imports: [
    OrganizationsModule,
    AuthMembershipLockModule,
    WikiReferenceLockQueryModule,
  ],
  providers: [
    {
      provide: GraphSourceAccessProvider,
      useClass: WorkosGraphSourceAccessAdapter,
    },
  ],
  exports: [GraphSourceAccessProvider],
})
export class WorkosGraphSourceAccessModule {}
