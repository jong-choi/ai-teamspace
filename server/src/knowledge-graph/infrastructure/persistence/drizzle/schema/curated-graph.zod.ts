import { CuratedGraphPropertiesSchema } from '@/knowledge-graph/domain/curated-graph-properties';
import { curatedEdge } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-edge.schema';
import { curatedNode } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-node.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

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
    title: curatedNodeSelectSchema.shape.title.trim().min(1).max(200),
    properties: CuratedGraphPropertiesSchema.default({}),
  });

export const UpdateCuratedNodeSchema = curatedNodeUpdateSchema
  .pick({ kind: true, title: true, properties: true })
  .extend({
    title: curatedNodeSelectSchema.shape.title
      .trim()
      .min(1)
      .max(200)
      .optional(),
    properties: CuratedGraphPropertiesSchema.optional(),
  });

export const CreateCuratedEdgeSchema = curatedEdgeInsertSchema
  .pick({
    sourceNodeId: true,
    targetNodeId: true,
    sourceNodeKind: true,
    targetNodeKind: true,
    predicate: true,
    directed: true,
    properties: true,
  })
  .extend({
    sourceNodeKind:
      curatedEdgeSelectSchema.shape.sourceNodeKind.default('curated_node'),
    targetNodeKind:
      curatedEdgeSelectSchema.shape.targetNodeKind.default('curated_node'),
    directed: curatedEdgeSelectSchema.shape.directed.default(true),
    properties: CuratedGraphPropertiesSchema.default({}),
  });

export const UpdateCuratedEdgeSchema = curatedEdgeUpdateSchema
  .pick({
    sourceNodeId: true,
    targetNodeId: true,
    sourceNodeKind: true,
    targetNodeKind: true,
    predicate: true,
    directed: true,
    properties: true,
  })
  .extend({
    properties: CuratedGraphPropertiesSchema.optional(),
  });
