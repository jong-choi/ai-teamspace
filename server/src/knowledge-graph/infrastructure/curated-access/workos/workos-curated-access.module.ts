import { Module } from '@nestjs/common';

import { AuthMembershipLockModule } from '@/auth/auth-membership-lock.module';
import { CalendarReferenceLockQueryModule } from '@/calendar/calendar-reference-lock-query.module';
import { CuratedAccessProvider } from '@/knowledge-graph/infrastructure/curated-access/curated-access.provider';
import { WorkosCuratedAccessAdapter } from '@/knowledge-graph/infrastructure/curated-access/workos/workos-curated-access.adapter';
import { ProjectReferenceLockQueryModule } from '@/projects/project-reference-lock-query.module';
import { WikiReferenceLockQueryModule } from '@/wiki/wiki-reference-lock-query.module';
@Module({
  imports: [
    AuthMembershipLockModule,
    WikiReferenceLockQueryModule,
    ProjectReferenceLockQueryModule,
    CalendarReferenceLockQueryModule,
  ],
  providers: [
    { provide: CuratedAccessProvider, useClass: WorkosCuratedAccessAdapter },
  ],
  exports: [CuratedAccessProvider],
})
export class WorkosCuratedAccessModule {}
