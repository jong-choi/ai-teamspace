import type { GraphRebuildRequest } from '@/knowledge-graph/domain/graph-rebuild';

import { z } from 'zod';

export const GraphCompletenessSchema = z
  .enum(['complete', 'rebuilding', 'degraded'])
  .meta({ id: 'GraphCompleteness' });

export type GraphCompleteness = z.infer<typeof GraphCompletenessSchema>;

export function completeGraphCompleteness(): GraphCompleteness {
  return 'complete';
}

export function deriveGraphCompleteness(
  latest: GraphRebuildRequest | null,
): GraphCompleteness {
  if (!latest || latest.status === 'succeeded') return 'complete';
  if (
    latest.status === 'accepted' ||
    latest.status === 'running' ||
    latest.status === 'catching_up' ||
    latest.status === 'cancel_requested'
  ) {
    return 'rebuilding';
  }
  return 'degraded';
}
