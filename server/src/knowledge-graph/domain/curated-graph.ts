import {
  curatedEdgeSelectSchema,
  curatedNodeSelectSchema,
} from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-graph.zod';

import type { z } from 'zod';

export type CuratedNode = z.infer<typeof curatedNodeSelectSchema>;
export type CuratedEdge = z.infer<typeof curatedEdgeSelectSchema>;
