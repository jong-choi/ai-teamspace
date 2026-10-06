import { Module } from '@nestjs/common';

import { ProjectDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/project.repository';
import { ProjectReferenceDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/project-reference.repository';
import { TicketWorkflowDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-workflow.repository';
import { ProjectColumnRepository } from '@/projects/infrastructure/persistence/project-column.repository';
import { ProjectRepository } from '@/projects/infrastructure/persistence/project.repository';
import { ProjectReferenceRepository } from '@/projects/infrastructure/persistence/project-reference.repository';
import { TicketRepository } from '@/projects/infrastructure/persistence/ticket.repository';
import { TicketWorkflowRepository } from '@/projects/infrastructure/persistence/ticket-workflow.repository';

@Module({
  providers: [
    ProjectDrizzleRepository,
    {
      provide: ProjectRepository,
      useExisting: ProjectDrizzleRepository,
    },
    {
      provide: ProjectColumnRepository,
      useExisting: ProjectDrizzleRepository,
    },
    {
      provide: TicketRepository,
      useExisting: ProjectDrizzleRepository,
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
    ProjectColumnRepository,
    TicketRepository,
    TicketWorkflowRepository,
    ProjectReferenceRepository,
  ],
})
export class ProjectDrizzlePersistenceModule {}
