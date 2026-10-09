import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MeetingProjectionQueryModule } from '@/calendar/meeting-projection-query.module';
import { KNOWLEDGE_GRAPH_REBUILD_QUEUE } from '@/jobs/knowledge-graph/knowledge-graph-rebuild.job';
import { KnowledgeGraphRebuildProcessor } from '@/jobs/knowledge-graph/knowledge-graph-rebuild.processor';
import { KnowledgeGraphRebuildReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-rebuild-reconciliation.scheduler';
import { GraphRebuildWorkflowService } from '@/knowledge-graph/graph-rebuild-workflow.service';
import { CuratedProjectionPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/curated-projection-persistence.module';
import { GraphRebuildPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/graph-rebuild-persistence.module';
import { GraphRebuildProgressPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/outbox/graph-rebuild-progress-persistence.module';
import { WorkosSourceAdapter } from '@/knowledge-graph/infrastructure/source/workos/workos-source.adapter';
import { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';
import { WorkosGraphSourceAccessModule } from '@/knowledge-graph/infrastructure/source-access/workos/workos-graph-source-access.module';
import { MembershipProjectionQueryModule } from '@/organizations/membership-projection-query.module';
import { ProjectProjectionQueryModule } from '@/projects/project-projection-query.module';
import { TicketLabelProjectionQueryModule } from '@/projects/ticket-label-projection-query.module';
import { TicketProjectionQueryModule } from '@/projects/ticket-projection-query.module';
import { QueueModule } from '@/queue/queue.module';
import { WikiProjectionQueryModule } from '@/wiki/wiki-projection-query.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: KNOWLEDGE_GRAPH_REBUILD_QUEUE }),
    CuratedProjectionPersistenceModule,
    GraphRebuildPersistenceModule,
    GraphRebuildProgressPersistenceModule,
    MeetingProjectionQueryModule,
    MembershipProjectionQueryModule,
    ProjectProjectionQueryModule,
    QueueModule.forWorker(),
    TicketLabelProjectionQueryModule,
    TicketProjectionQueryModule,
    WikiProjectionQueryModule,
    WorkosGraphSourceAccessModule,
  ],
  providers: [
    {
      provide: WorkosSourceProvider,
      useClass: WorkosSourceAdapter,
    },
    GraphRebuildWorkflowService,
    KnowledgeGraphRebuildProcessor,
    KnowledgeGraphRebuildReconciliationScheduler,
  ],
})
export class KnowledgeGraphRebuildJobsModule {}
