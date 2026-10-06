import { Module } from '@nestjs/common';

import { ProjectDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/project.repository';
import { ProjectReferenceDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/project-reference.repository';
import { TicketWorkflowDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-workflow.repository';
import { ProjectRepository } from '@/projects/infrastructure/persistence/project.repository';
import { ProjectReferenceRepository } from '@/projects/infrastructure/persistence/project-reference.repository';
import { TicketWorkflowRepository } from '@/projects/infrastructure/persistence/ticket-workflow.repository';

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
