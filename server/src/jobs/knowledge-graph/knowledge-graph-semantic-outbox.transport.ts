import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  NonRetryableMessageError,
  type OutboxMessage,
  OutboxTransport,
} from '@nestjs/outbox';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import { SemanticDeliveryService } from '@/knowledge-graph/semantic-delivery.service';
import {
  type SemanticSourceScope,
  SemanticSourceScopeSchema,
} from '@/outbox/domain/semantic-source';
import { OutboxAggregateEventSchema } from '@/outbox/outbox-aggregate-event.schema';
import {
  KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
  KNOWLEDGE_GRAPH_SEMANTIC_MANUAL_TOPIC,
  SemanticManualRequestedEventSchema,
} from '@/outbox/outbox-semantic-event.schema';

@Injectable()
export class KnowledgeGraphSemanticOutboxTransport extends OutboxTransport {
  private readonly logger = new Logger(
    KnowledgeGraphSemanticOutboxTransport.name,
  );
  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly delivery: SemanticDeliveryService,
    private readonly queue: SemanticJobQueueProvider,
  ) {
    super();
  }

  async publish(
    message: OutboxMessage,
    { signal }: Parameters<OutboxTransport['publish']>[1],
  ) {
    if (signal.aborted)
      throw new Error('KNOWLEDGE_GRAPH_SEMANTIC_PUBLISH_ABORTED');
    if (message.topic === KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC) {
      const parsed = OutboxAggregateEventSchema.safeParse(message.payload);
      if (!parsed.success)
        throw new NonRetryableMessageError(
          'KNOWLEDGE_GRAPH_SEMANTIC_PAYLOAD_INVALID',
        );
      const scope = SemanticSourceScopeSchema.safeParse(parsed.data);
      if (!scope.success)
        throw new NonRetryableMessageError(
          'KNOWLEDGE_GRAPH_SEMANTIC_SOURCE_INVALID',
        );
      this.assertKey(message, scope.data);
      const observation = await this.delivery.observeCommitted(
        scope.data,
        parsed.data.sourceVersion,
      );
      if (!this.config.semanticEnabled || observation.kind !== 'observed')
        return;
      if (parsed.data.operation === 'removed')
        await this.queue.remove(scope.data, parsed.data.sourceVersion, signal);
      else await this.queue.auto(scope.data, observation.delayMs, signal);
      return;
    }
    if (message.topic === KNOWLEDGE_GRAPH_SEMANTIC_MANUAL_TOPIC) {
      const parsed = SemanticManualRequestedEventSchema.safeParse(
        message.payload,
      );
      if (!parsed.success)
        throw new NonRetryableMessageError(
          'KNOWLEDGE_GRAPH_SEMANTIC_PAYLOAD_INVALID',
        );
      const scope = SemanticSourceScopeSchema.parse(parsed.data);
      this.assertKey(message, scope);
      if (!this.config.semanticEnabled) return;
      await this.queue.manual(scope, parsed.data.requestId, signal);
      try {
        await this.delivery.markManualDelivered(
          scope,
          parsed.data.manualRequestSeq,
        );
      } catch {
        this.logger.warn({ code: 'KG_SEMANTIC_MANUAL_DELIVERED_MARK_FAILED' });
      }
      return;
    }
    throw new NonRetryableMessageError(
      'KNOWLEDGE_GRAPH_SEMANTIC_TOPIC_INVALID',
    );
  }
  private assertKey(message: OutboxMessage, scope: SemanticSourceScope) {
    if (
      message.key !==
      JSON.stringify([
        scope.aggregateKind,
        scope.organizationId,
        scope.aggregateId,
      ])
    )
      throw new NonRetryableMessageError(
        'KNOWLEDGE_GRAPH_SEMANTIC_KEY_INVALID',
      );
  }
}
