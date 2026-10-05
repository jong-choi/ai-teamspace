import { Module } from '@nestjs/common';

import { ProjectDrizzleRepository } from '#server/projects/infrastructure/persistence/drizzle/repositories/project.repository.js';
import { ProjectRepository } from '#server/projects/infrastructure/persistence/project.repository.js';

@Module({
  providers: [
    {
      provide: ProjectRepository,
      useClass: ProjectDrizzleRepository,
    },
  ],
  exports: [ProjectRepository],
})
export class ProjectDrizzlePersistenceModule {}
