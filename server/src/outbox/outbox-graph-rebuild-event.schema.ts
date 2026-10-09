import { GraphRebuildRequestSelectSchema } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/graph-rebuild-request.zod';

import { z } from 'zod';

export const KNOWLEDGE_GRAPH_REBUILD_REQUESTED_TOPIC =
  'kg.graph-rebuild-requested.v1';

export const GraphRebuildRequestedEventSchema = z
  .object({
    organizationId: GraphRebuildRequestSelectSchema.shape.organizationId
      .min(1)
      .max(256),
    requestId: GraphRebuildRequestSelectSchema.shape.id,
    occurredAt: z.iso.datetime(),
  })
  .strict();

export type GraphRebuildRequestedEvent = z.infer<
  typeof GraphRebuildRequestedEventSchema
>;
