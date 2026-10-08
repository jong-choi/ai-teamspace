import { Module } from '@nestjs/common';

import { ProjectReferenceLockPersistenceModule } from '@/projects/infrastructure/persistence/drizzle/project-reference-lock-persistence.module';
import { ProjectReferenceLockQueryService } from '@/projects/project-reference-lock-query.service';
@Module({
  imports: [ProjectReferenceLockPersistenceModule],
  providers: [ProjectReferenceLockQueryService],
  exports: [ProjectReferenceLockQueryService],
})
export class ProjectReferenceLockQueryModule {}
