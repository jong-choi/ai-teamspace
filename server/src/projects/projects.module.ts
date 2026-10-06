import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { OrganizationsModule } from '@/organizations/organizations.module';
import { ProjectDrizzlePersistenceModule } from '@/projects/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { ProjectColumnsService } from '@/projects/project-columns.service';
import { ProjectReferenceQueryService } from '@/projects/project-reference-query.service';
import { ProjectResourceLoader } from '@/projects/project-resource.loader';
import { ProjectUserResolver } from '@/projects/project-user.resolver';
import { ProjectsController } from '@/projects/projects.controller';
import { ProjectsService } from '@/projects/projects.service';
import { TicketWorkflowController } from '@/projects/ticket-workflow.controller';
import { TicketWorkflowService } from '@/projects/ticket-workflow.service';
import { TicketsService } from '@/projects/tickets.service';

@Module({
  imports: [AuthModule, OrganizationsModule, ProjectDrizzlePersistenceModule],
  controllers: [ProjectsController, TicketWorkflowController],
  providers: [
    ProjectsService,
    ProjectColumnsService,
    TicketsService,
    ProjectResourceLoader,
    ProjectUserResolver,
    ProjectReferenceQueryService,
    TicketWorkflowService,
    TrustedOriginGuard,
  ],
  exports: [ProjectReferenceQueryService],
})
export class ProjectsModule {}
