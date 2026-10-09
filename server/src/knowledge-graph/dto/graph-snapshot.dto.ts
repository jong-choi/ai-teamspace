import { createZodDto } from '@/common/dto/create-zod-dto';
import { GraphCompletenessSchema } from '@/knowledge-graph/domain/graph-completeness';
import {
  GraphEdgeRelationSchema,
  GraphFactClassSchema,
  GraphNodeKindSchema,
  GraphOwnerKindSchema,
  GraphPermissionsSchema,
} from '@/knowledge-graph/domain/graph-read-contract';

import { z } from 'zod';

export { GraphCompletenessSchema };

const cursorSchema = z.string().min(1).max(2048);
const graphIdSchema = z.string().min(1).max(512);
const isoDateTimeSchema = z.iso.datetime();

export const ExploreQuerySchema = z
  .object({
    focusKind: GraphNodeKindSchema.optional(),
    focusId: graphIdSchema.optional(),
    q: z.string().trim().min(1).max(200).optional(),
    depth: z.coerce.number().int().min(1).max(2).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: cursorSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.q) || Boolean(value.focusKind && value.focusId),
    {
      message: 'focusKind/focusId 또는 q가 필요합니다.',
    },
  )
  .refine((value) => !value.focusKind || Boolean(value.focusId), {
    message: 'focusKind를 사용하려면 focusId가 필요합니다.',
  })
  .refine((value) => !value.focusId || Boolean(value.focusKind), {
    message: 'focusId를 사용하려면 focusKind가 필요합니다.',
  })
  .meta({ id: 'KnowledgeGraphExploreQuery' });

export const GraphSourceRefSchema = z
  .object({
    kind: GraphOwnerKindSchema.or(z.literal('curated_node')),
    id: z.string().min(1).max(512),
    title: z.string().min(1).max(500).nullable(),
    updatedAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const GraphProjectionStateSchema = z
  .object({
    status: z.enum(['applied', 'pending', 'failed', 'unknown']),
    desiredSeq: z.number().int().nonnegative().nullable(),
    appliedSeq: z.number().int().nonnegative().nullable(),
    sourceUpdatedAt: isoDateTimeSchema.nullable(),
  })
  .strict()
  .meta({ id: 'GraphProjectionState' });

export const EditTargetSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('none'),
        reason: z.enum(['authoritative', 'not_permitted', 'unavailable']),
      })
      .strict(),
    z
      .object({
        kind: z.literal('owner'),
        ownerKind: GraphOwnerKindSchema,
        sourceId: z.string().min(1).max(512),
      })
      .strict(),
    z
      .object({
        kind: z.literal('curated_node'),
        nodeId: z.uuid(),
        revision: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('curated_edge'),
        edgeId: z.uuid(),
        revision: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('semantic_correction'),
        sourceId: z.uuid(),
        generationId: z.uuid(),
        targetKey: z.string().min(1).max(512),
        targetKind: z.enum(['entity', 'relation']),
      })
      .strict(),
  ])
  .meta({ id: 'GraphEditTarget' });

export const GraphNodeSchema = z
  .object({
    id: graphIdSchema,
    kind: GraphNodeKindSchema,
    title: z.string().min(1).max(500),
    factClass: GraphFactClassSchema,
    sourceRef: GraphSourceRefSchema.nullable(),
    permissions: GraphPermissionsSchema,
    editTarget: EditTargetSchema,
    projectionState: GraphProjectionStateSchema.nullable(),
    completeness: GraphCompletenessSchema,
    provenance: z
      .object({
        extractedName: z.string().min(1).max(500).nullable(),
        generationId: z.uuid().nullable(),
        evidenceDigest: z.string().min(1).max(256).nullable(),
      })
      .strict()
      .nullable(),
    connectedEdgeCount: z.number().int().nonnegative().optional(),
  })
  .strict()
  .meta({ id: 'GraphNode' });

export const GraphEdgeSchema = z
  .object({
    id: graphIdSchema,
    relation: GraphEdgeRelationSchema,
    sourceNodeId: graphIdSchema,
    targetNodeId: graphIdSchema,
    directed: z.boolean(),
    predicate: z.string().min(1).max(200).nullable(),
    factClass: GraphFactClassSchema,
    sourceRef: GraphSourceRefSchema.nullable(),
    permissions: GraphPermissionsSchema,
    editTarget: EditTargetSchema,
    projectionState: GraphProjectionStateSchema.nullable(),
    completeness: GraphCompletenessSchema,
    provenance: z
      .object({
        generationId: z.uuid().nullable(),
        chunkIndex: z.number().int().nonnegative().nullable(),
        evidenceDigest: z.string().min(1).max(256).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .meta({ id: 'GraphEdge' });

export const GraphSnapshotSchema = z
  .object({
    nodes: GraphNodeSchema.array(),
    edges: GraphEdgeSchema.array(),
    truncated: z.boolean(),
    nextCursor: cursorSchema.nullable(),
    completeness: GraphCompletenessSchema,
    degradedReasons: z
      .enum(['projection_pending', 'graph_unavailable', 'partial_rebuild'])
      .array(),
  })
  .strict()
  .meta({ id: 'GraphSnapshot' });

export const GraphNodeListQuerySchema = z
  .object({
    kind: GraphNodeKindSchema.optional(),
    q: z.string().trim().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: cursorSchema.optional(),
  })
  .strict()
  .meta({ id: 'GraphNodeListQuery' });

export const GraphEdgeListQuerySchema = z
  .object({
    relation: GraphEdgeRelationSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: cursorSchema.optional(),
  })
  .strict()
  .meta({ id: 'GraphEdgeListQuery' });

export const GraphNodeListSchema = z
  .object({
    items: GraphNodeSchema.array(),
    totalCount: z.number().int().nonnegative().nullable(),
    countAccuracy: z.enum(['exact', 'unknown']),
    nextCursor: cursorSchema.nullable(),
    completeness: GraphCompletenessSchema,
  })
  .strict()
  .meta({ id: 'GraphNodeList' });

export const GraphEdgeListSchema = z
  .object({
    items: GraphEdgeSchema.array(),
    totalCount: z.number().int().nonnegative().nullable(),
    countAccuracy: z.enum(['exact', 'unknown']),
    nextCursor: cursorSchema.nullable(),
    completeness: GraphCompletenessSchema,
  })
  .strict()
  .meta({ id: 'GraphEdgeList' });

export type ExploreQuery = z.infer<typeof ExploreQuerySchema>;
export type GraphSourceRef = z.infer<typeof GraphSourceRefSchema>;
export type GraphProjectionState = z.infer<typeof GraphProjectionStateSchema>;
export type EditTarget = z.infer<typeof EditTargetSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphSnapshot = z.infer<typeof GraphSnapshotSchema>;
export type GraphNodeListQuery = z.infer<typeof GraphNodeListQuerySchema>;
export type GraphEdgeListQuery = z.infer<typeof GraphEdgeListQuerySchema>;
export type GraphNodeList = z.infer<typeof GraphNodeListSchema>;
export type GraphEdgeList = z.infer<typeof GraphEdgeListSchema>;

export class ExploreQueryDto extends createZodDto(ExploreQuerySchema) {}
export class GraphNodeDto extends createZodDto(GraphNodeSchema) {}
export class GraphEdgeDto extends createZodDto(GraphEdgeSchema) {}
export class GraphSnapshotDto extends createZodDto(GraphSnapshotSchema) {}
export class GraphNodeListQueryDto extends createZodDto(
  GraphNodeListQuerySchema,
) {}
export class GraphEdgeListQueryDto extends createZodDto(
  GraphEdgeListQuerySchema,
) {}
export class GraphNodeListDto extends createZodDto(GraphNodeListSchema) {}
export class GraphEdgeListDto extends createZodDto(GraphEdgeListSchema) {}
