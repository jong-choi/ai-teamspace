import { graphRebuildRequest } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/graph-rebuild-request.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

export const GraphRebuildRequestSelectSchema =
  createSelectSchema(graphRebuildRequest);
export const GraphRebuildRequestInsertSchema =
  createInsertSchema(graphRebuildRequest);
export const GraphRebuildRequestUpdateSchema =
  createUpdateSchema(graphRebuildRequest);
