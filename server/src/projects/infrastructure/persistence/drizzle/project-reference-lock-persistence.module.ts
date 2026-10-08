import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { ProjectReferenceLockDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/project-reference-lock.repository';
import { ProjectReferenceLockRepository } from '@/projects/infrastructure/persistence/project-reference-lock.repository';
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: ProjectReferenceLockRepository,
      useClass: ProjectReferenceLockDrizzleRepository,
    },
  ],
  exports: [ProjectReferenceLockRepository],
})
export class ProjectReferenceLockPersistenceModule {}
