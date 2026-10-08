import { Module } from '@nestjs/common';

import { ProjectProjectionPersistenceModule } from '@/projects/infrastructure/persistence/drizzle/project-projection-persistence.module';
import { ProjectProjectionQueryService } from '@/projects/project-projection-query.service';

@Module({
  imports: [ProjectProjectionPersistenceModule],
  providers: [ProjectProjectionQueryService],
  exports: [ProjectProjectionQueryService],
})
export class ProjectProjectionQueryModule {}
