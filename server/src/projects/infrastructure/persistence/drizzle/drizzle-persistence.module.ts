import { Module } from '@nestjs/common';

import { ProjectDrizzleRepository } from '#server/projects/infrastructure/persistence/drizzle/repositories/project.repository.js';
import { ProjectReferenceDrizzleRepository } from '#server/projects/infrastructure/persistence/drizzle/repositories/project-reference.repository.js';
import { TicketWorkflowDrizzleRepository } from '#server/projects/infrastructure/persistence/drizzle/repositories/ticket-workflow.repository.js';
import { ProjectRepository } from '#server/projects/infrastructure/persistence/project.repository.js';
import { ProjectReferenceRepository } from '#server/projects/infrastructure/persistence/project-reference.repository.js';
import { TicketWorkflowRepository } from '#server/projects/infrastructure/persistence/ticket-workflow.repository.js';

@Module({
  providers: [
    {
      provide: ProjectRepository,
      useClass: ProjectDrizzleRepository,
    },
    {
      provide: TicketWorkflowRepository,
      useClass: TicketWorkflowDrizzleRepository,
    },
    {
      provide: ProjectReferenceRepository,
      useClass: ProjectReferenceDrizzleRepository,
    },
  ],
  exports: [
    ProjectRepository,
    TicketWorkflowRepository,
    ProjectReferenceRepository,
  ],
})
export class ProjectDrizzlePersistenceModule {}
