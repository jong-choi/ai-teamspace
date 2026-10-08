import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { ProjectProjectionSourceDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/project-projection-source.repository';
import { ProjectProjectionSourceRepository } from '@/projects/infrastructure/persistence/project-projection-source.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: ProjectProjectionSourceRepository,
      useClass: ProjectProjectionSourceDrizzleRepository,
    },
  ],
  exports: [ProjectProjectionSourceRepository],
})
export class ProjectProjectionPersistenceModule {}
