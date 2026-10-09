import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';

import { MeetingProjectionQueryModule } from '@/calendar/meeting-projection-query.module';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';
import { KnowledgeGraphOutboxTransport } from '@/jobs/knowledge-graph/knowledge-graph-outbox.transport';
import { KnowledgeGraphOutboxTransportModule } from '@/jobs/knowledge-graph/knowledge-graph-outbox-transport.module';
import { KNOWLEDGE_GRAPH_PROJECTION_QUEUE } from '@/jobs/knowledge-graph/knowledge-graph-projection.job';
import { KnowledgeGraphProjectionProcessor } from '@/jobs/knowledge-graph/knowledge-graph-projection.processor';
import { KnowledgeGraphRebuildOutboxTransport } from '@/jobs/knowledge-graph/knowledge-graph-rebuild-outbox.transport';
import { KnowledgeGraphRebuildOutboxTransportModule } from '@/jobs/knowledge-graph/knowledge-graph-rebuild-outbox-transport.module';
import { KnowledgeGraphReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-reconciliation.scheduler';
import { KnowledgeGraphSemanticOutboxTransport } from '@/jobs/knowledge-graph/knowledge-graph-semantic-outbox.transport';
import { KnowledgeGraphSemanticOutboxTransportModule } from '@/jobs/knowledge-graph/knowledge-graph-semantic-outbox-transport.module';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { KnowledgeGraphWriter } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-writer.provider';
import { LangchainNeo4jGraphAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-graph.adapter';
import { CuratedProjectionPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/curated-projection-persistence.module';
import { ReconciliationPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/reconciliation-persistence.module';
import { OutboxProjectionDeliveryAdapter } from '@/knowledge-graph/infrastructure/persistence/outbox/outbox-projection-delivery.adapter';
import { OutboxProjectionStateAdapter } from '@/knowledge-graph/infrastructure/persistence/outbox/outbox-projection-state.adapter';
import { ProjectionDeliveryRepository } from '@/knowledge-graph/infrastructure/persistence/projection-delivery.repository';
import { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import { WorkosSourceAdapter } from '@/knowledge-graph/infrastructure/source/workos/workos-source.adapter';
import { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';
import { KnowledgeGraphBackfillService } from '@/knowledge-graph/knowledge-graph-backfill.service';
import { KnowledgeGraphProjectionService } from '@/knowledge-graph/knowledge-graph-projection.service';
import { KnowledgeGraphReconciliationService } from '@/knowledge-graph/knowledge-graph-reconciliation.service';
import { MembershipProjectionQueryModule } from '@/organizations/membership-projection-query.module';
import {
  KNOWLEDGE_GRAPH_OUTBOX_TOPIC,
  OutboxAggregateChangePublisher,
} from '@/outbox/outbox-aggregate-change.publisher';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import { KNOWLEDGE_GRAPH_REBUILD_REQUESTED_TOPIC } from '@/outbox/outbox-graph-rebuild-event.schema';
import {
  KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
  KNOWLEDGE_GRAPH_SEMANTIC_MANUAL_TOPIC,
} from '@/outbox/outbox-semantic-event.schema';
import { ProjectProjectionQueryModule } from '@/projects/project-projection-query.module';
import { TicketLabelProjectionQueryModule } from '@/projects/ticket-label-projection-query.module';
import { TicketProjectionQueryModule } from '@/projects/ticket-projection-query.module';
import { QueueModule } from '@/queue/queue.module';
import { WikiProjectionQueryModule } from '@/wiki/wiki-projection-query.module';

@Module({
  imports: [
    ConfigModule.forFeature(knowledgeGraphConfig),
    DatabaseModule,
    MeetingProjectionQueryModule,
    CuratedProjectionPersistenceModule,
    ReconciliationPersistenceModule,
    MembershipProjectionQueryModule,
    WikiProjectionQueryModule,
    ProjectProjectionQueryModule,
    TicketLabelProjectionQueryModule,
    TicketProjectionQueryModule,
    QueueModule.forWorker(),
    BullModule.registerQueue({ name: KNOWLEDGE_GRAPH_PROJECTION_QUEUE }),
    OutboxModule.forRootAsync({
      isGlobal: false,
      imports: [
        ConfigModule.forFeature(knowledgeGraphConfig),
        KnowledgeGraphOutboxTransportModule,
        KnowledgeGraphRebuildOutboxTransportModule,
        KnowledgeGraphSemanticOutboxTransportModule,
      ],
      inject: [
        knowledgeGraphConfig.KEY,
        KnowledgeGraphOutboxTransport,
        KnowledgeGraphRebuildOutboxTransport,
        KnowledgeGraphSemanticOutboxTransport,
      ],
      useFactory: (
        config: ConfigType<typeof knowledgeGraphConfig>,
        transport: KnowledgeGraphOutboxTransport,
        rebuildTransport: KnowledgeGraphRebuildOutboxTransport,
        semanticTransport: KnowledgeGraphSemanticOutboxTransport,
      ) => ({
        relay: {
          enabled: config.enabled,
          pollInterval: '1s',
          batchSize: 25,
          concurrency: 4,
          lease: '30s',
          publishTimeout: '8s',
        },
        route: (message: { topic: string }) =>
          message.topic === KNOWLEDGE_GRAPH_OUTBOX_TOPIC
            ? 'knowledgeGraph'
            : message.topic === KNOWLEDGE_GRAPH_REBUILD_REQUESTED_TOPIC
              ? 'knowledgeGraphRebuild'
              : message.topic === KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC ||
                  message.topic === KNOWLEDGE_GRAPH_SEMANTIC_MANUAL_TOPIC
                ? 'knowledgeGraphSemantic'
                : 'local',
        transports: {
          knowledgeGraph: transport,
          knowledgeGraphRebuild: rebuildTransport,
          knowledgeGraphSemantic: semanticTransport,
        },
      }),
    }),
  ],
  providers: [
    { provide: KnowledgeGraphWriter, useClass: LangchainNeo4jGraphAdapter },
    OutboxAggregateChangePublisher,
    {
      provide: ProjectionDeliveryRepository,
      useClass: OutboxProjectionDeliveryAdapter,
    },
    OutboxAggregateProjectionState,
    {
      provide: ProjectionStateRepository,
      useClass: OutboxProjectionStateAdapter,
    },
    { provide: WorkosSourceProvider, useClass: WorkosSourceAdapter },
    KnowledgeGraphBackfillService,
    KnowledgeGraphProjectionService,
    KnowledgeGraphReconciliationService,
    KnowledgeGraphReconciliationScheduler,
    KnowledgeGraphProjectionProcessor,
    {
      provide: PostgresOutboxStore,
      inject: [DatabaseService, OutboxStorage],
      useFactory: (database: DatabaseService, storage: OutboxStorage) =>
        new PostgresOutboxStore(
          { executor: fromDrizzle(database.db), migrate: false },
          storage,
        ),
    },
  ],
  exports: [
    OutboxAggregateChangePublisher,
    KnowledgeGraphBackfillService,
    WorkosSourceProvider,
  ],
})
export class KnowledgeGraphJobsModule {}
