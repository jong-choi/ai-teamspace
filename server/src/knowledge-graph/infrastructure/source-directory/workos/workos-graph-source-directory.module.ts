import { Module } from '@nestjs/common';

import { MeetingProjectionQueryModule } from '@/calendar/meeting-projection-query.module';
import { GraphSourceDirectoryProvider } from '@/knowledge-graph/infrastructure/source-directory/graph-source-directory.provider';
import { WorkosGraphSourceDirectoryAdapter } from '@/knowledge-graph/infrastructure/source-directory/workos/workos-graph-source-directory.adapter';
import { OrganizationsModule } from '@/organizations/organizations.module';
import { ProjectProjectionQueryModule } from '@/projects/project-projection-query.module';
import { TicketProjectionQueryModule } from '@/projects/ticket-projection-query.module';
import { WikiProjectionQueryModule } from '@/wiki/wiki-projection-query.module';

@Module({
  imports: [
    MeetingProjectionQueryModule,
    OrganizationsModule,
    ProjectProjectionQueryModule,
    TicketProjectionQueryModule,
    WikiProjectionQueryModule,
  ],
  providers: [
    {
      provide: GraphSourceDirectoryProvider,
      useClass: WorkosGraphSourceDirectoryAdapter,
    },
  ],
  exports: [GraphSourceDirectoryProvider],
})
export class WorkosGraphSourceDirectoryModule {}
