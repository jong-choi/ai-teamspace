import { Module } from '@nestjs/common';

import { ProjectDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/project.repository';
import { ProjectColumnDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/project-column.repository';
import { ProjectReferenceDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/project-reference.repository';
import { TicketDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/ticket.repository';
import { TicketChecklistDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-checklist.repository';
import { TicketCommentDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-comment.repository';
import { TicketDetailQueryDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-detail-query.repository';
import { TicketLabelDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-label.repository';
import { TicketOrderingDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-ordering.repository';
import { ProjectRepository } from '@/projects/infrastructure/persistence/project.repository';
import { ProjectColumnRepository } from '@/projects/infrastructure/persistence/project-column.repository';
import { ProjectReferenceRepository } from '@/projects/infrastructure/persistence/project-reference.repository';
import { TicketRepository } from '@/projects/infrastructure/persistence/ticket.repository';
import { TicketChecklistRepository } from '@/projects/infrastructure/persistence/ticket-checklist.repository';
import { TicketCommentRepository } from '@/projects/infrastructure/persistence/ticket-comment.repository';
import { TicketDetailQueryRepository } from '@/projects/infrastructure/persistence/ticket-detail-query.repository';
import { TicketLabelRepository } from '@/projects/infrastructure/persistence/ticket-label.repository';
import { TicketOrderingRepository } from '@/projects/infrastructure/persistence/ticket-ordering.repository';

@Module({
  providers: [
    {
      provide: ProjectRepository,
      useClass: ProjectDrizzleRepository,
    },
    {
      provide: ProjectColumnRepository,
      useClass: ProjectColumnDrizzleRepository,
    },
    {
      provide: TicketRepository,
      useClass: TicketDrizzleRepository,
    },
    {
      provide: TicketDetailQueryRepository,
      useClass: TicketDetailQueryDrizzleRepository,
    },
    {
      provide: TicketOrderingRepository,
      useClass: TicketOrderingDrizzleRepository,
    },
    {
      provide: TicketLabelRepository,
      useClass: TicketLabelDrizzleRepository,
    },
    {
      provide: TicketChecklistRepository,
      useClass: TicketChecklistDrizzleRepository,
    },
    {
      provide: TicketCommentRepository,
      useClass: TicketCommentDrizzleRepository,
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
    TicketDetailQueryRepository,
    TicketOrderingRepository,
    TicketLabelRepository,
    TicketChecklistRepository,
    TicketCommentRepository,
    ProjectReferenceRepository,
  ],
})
export class ProjectDrizzlePersistenceModule {}
