import {
  CURATED_EDGE_PREDICATES,
  CURATED_NODE_KINDS,
} from '@/knowledge-graph/domain/curated-graph.constants';
import { CuratedGraphPropertiesSchema } from '@/knowledge-graph/domain/curated-graph-properties';
import { curatedEdge } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-edge.schema';
import { curatedNode } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-node.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const curatedNodeSelectSchema = createSelectSchema(curatedNode, {
  properties: CuratedGraphPropertiesSchema,
});
export const curatedNodeInsertSchema = createInsertSchema(curatedNode, {
  properties: CuratedGraphPropertiesSchema,
});
export const curatedNodeUpdateSchema = createUpdateSchema(curatedNode, {
  properties: CuratedGraphPropertiesSchema,
});

export const curatedEdgeSelectSchema = createSelectSchema(curatedEdge, {
  properties: CuratedGraphPropertiesSchema,
});
export const curatedEdgeInsertSchema = createInsertSchema(curatedEdge, {
  properties: CuratedGraphPropertiesSchema,
});
export const curatedEdgeUpdateSchema = createUpdateSchema(curatedEdge, {
  properties: CuratedGraphPropertiesSchema,
});

export const CreateCuratedNodeSchema = curatedNodeInsertSchema
  .pick({ kind: true, title: true, properties: true })
  .extend({
    kind: z.enum(CURATED_NODE_KINDS),
    properties: CuratedGraphPropertiesSchema.default({}),
  });

export const UpdateCuratedNodeSchema = curatedNodeUpdateSchema
  .pick({ title: true, properties: true })
  .extend({
    properties: CuratedGraphPropertiesSchema.optional(),
  });

export const CreateCuratedEdgeSchema = curatedEdgeInsertSchema
  .pick({
    sourceNodeId: true,
    targetNodeId: true,
    predicate: true,
    directed: true,
    properties: true,
  })
  .extend({
    predicate: z.enum(CURATED_EDGE_PREDICATES),
    directed: z.boolean().default(true),
    properties: CuratedGraphPropertiesSchema.default({}),
  });

export const UpdateCuratedEdgeSchema = curatedEdgeUpdateSchema
  .pick({ predicate: true, directed: true, properties: true })
  .extend({
    predicate: z.enum(CURATED_EDGE_PREDICATES).optional(),
    directed: z.boolean().optional(),
    properties: CuratedGraphPropertiesSchema.optional(),
  });
