import { GraphRebuildRequestSelectSchema } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/graph-rebuild-request.zod';

import { z } from 'zod';

export const KNOWLEDGE_GRAPH_REBUILD_QUEUE = 'knowledge-graph-rebuild';
export const KNOWLEDGE_GRAPH_REBUILD_JOB = 'knowledge-graph-rebuild-requested';

export const KnowledgeGraphRebuildJobDataSchema = z
  .object({
    requestId: GraphRebuildRequestSelectSchema.shape.id,
  })
  .strict();

export type KnowledgeGraphRebuildJobData = z.infer<
  typeof KnowledgeGraphRebuildJobDataSchema
>;

export function knowledgeGraphRebuildJobId(requestId: string): string {
  return `kg-rebuild-${requestId}`;
}
