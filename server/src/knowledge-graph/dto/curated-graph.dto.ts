import {
  CreateCuratedEdgeSchema,
  CreateCuratedNodeSchema,
  UpdateCuratedEdgeSchema,
  UpdateCuratedNodeSchema,
} from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-graph.zod';

import type { z } from 'zod';

export type CreateCuratedNodeInput = z.input<typeof CreateCuratedNodeSchema>;
export type UpdateCuratedNodeInput = z.input<typeof UpdateCuratedNodeSchema>;
export type CreateCuratedEdgeInput = z.input<typeof CreateCuratedEdgeSchema>;
export type UpdateCuratedEdgeInput = z.input<typeof UpdateCuratedEdgeSchema>;
