import { Module } from '@nestjs/common';

import { AuthModule } from '#server/auth/auth.module.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import { OrganizationsModule } from '#server/organizations/organizations.module.js';
import { ProjectDrizzlePersistenceModule } from '#server/projects/infrastructure/persistence/drizzle/drizzle-persistence.module.js';
import { ProjectsController } from '#server/projects/projects.controller.js';
import { ProjectsService } from '#server/projects/projects.service.js';
import { TicketWorkflowController } from '#server/projects/ticket-workflow.controller.js';
import { TicketWorkflowService } from '#server/projects/ticket-workflow.service.js';

@Module({
  imports: [AuthModule, OrganizationsModule, ProjectDrizzlePersistenceModule],
  controllers: [ProjectsController, TicketWorkflowController],
  providers: [ProjectsService, TicketWorkflowService, TrustedOriginGuard],
})
export class ProjectsModule {}
