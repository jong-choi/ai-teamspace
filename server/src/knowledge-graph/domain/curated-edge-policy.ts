import { CuratedGraphEndpointInvalidError } from '@/knowledge-graph/domain/curated-graph.error';
import { CreateCuratedEdgeSchema } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-graph.zod';

import type { z } from 'zod';

export function normalizeCuratedEdge(
  input: z.input<typeof CreateCuratedEdgeSchema>,
) {
  const edge = CreateCuratedEdgeSchema.parse(input);
  if (
    (edge.predicate !== 'references' &&
      (edge.sourceNodeKind !== 'curated_node' ||
        edge.targetNodeKind !== 'curated_node')) ||
    (edge.predicate !== 'related_to' && !edge.directed) ||
    (edge.predicate !== 'references' &&
      edge.sourceNodeKind === edge.targetNodeKind &&
      edge.sourceNodeId === edge.targetNodeId)
  ) {
    throw new CuratedGraphEndpointInvalidError();
  }
  if (!edge.directed && edge.sourceNodeId > edge.targetNodeId) {
    return {
      ...edge,
      sourceNodeId: edge.targetNodeId,
      targetNodeId: edge.sourceNodeId,
    };
  }
  return edge;
}
