import { KnowledgeGraphSemanticSearchUnavailableError } from '@/knowledge-graph/domain/graph-search.error';

import { z } from 'zod';

export const SemanticVectorIndexReadinessSchema = z
  .object({
    state: z.string(),
    dimension: z.coerce.number().int(),
  })
  .strict();

export function assertSemanticSearchVectorIndexReady(rows: unknown): void {
  const parsed = SemanticVectorIndexReadinessSchema.array().parse(rows);
  const row = parsed[0];
  if (!row || row.state !== 'ONLINE' || row.dimension !== 768)
    throw new KnowledgeGraphSemanticSearchUnavailableError(
      'KG_VECTOR_INDEX_NOT_READY',
    );
}
