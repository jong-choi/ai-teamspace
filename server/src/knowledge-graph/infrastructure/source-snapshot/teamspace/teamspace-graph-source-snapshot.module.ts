import { Module } from '@nestjs/common';

import { MeetingProjectionQueryModule } from '@/calendar/meeting-projection-query.module';
import { GraphSourceSnapshotProvider } from '@/knowledge-graph/infrastructure/source-snapshot/graph-source-snapshot.provider';
import { TeamspaceGraphSourceSnapshotAdapter } from '@/knowledge-graph/infrastructure/source-snapshot/teamspace/teamspace-graph-source-snapshot.adapter';
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
      provide: GraphSourceSnapshotProvider,
      useClass: TeamspaceGraphSourceSnapshotAdapter,
    },
  ],
  exports: [GraphSourceSnapshotProvider],
})
export class TeamspaceGraphSourceSnapshotModule {}
