import { SemanticSourceScopeSchema } from '@/outbox/domain/semantic-source';
import { OutboxSemanticSourceStateSelectSchema } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.zod';

import { z } from 'zod';

export const KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC =
  'kg.semantic-source-changed.v1';
export const KNOWLEDGE_GRAPH_SEMANTIC_MANUAL_TOPIC =
  'kg.semantic-manual-requested.v1';

export const SemanticManualRequestedEventSchema =
  SemanticSourceScopeSchema.extend({
    manualRequestSeq:
      OutboxSemanticSourceStateSelectSchema.shape.manualRequestSeq
        .positive()
        .max(Number.MAX_SAFE_INTEGER),
    requestId:
      OutboxSemanticSourceStateSelectSchema.shape.manualRequestId.unwrap(),
    occurredAt: z.iso.datetime(),
  }).strict();
