import { createZodDto } from '@/common/dto/create-zod-dto';
import {
  GraphRebuildModeSchema,
  GraphRebuildRequestSchema,
  GraphRebuildStatusSchema,
} from '@/knowledge-graph/domain/graph-rebuild';

import { z } from 'zod';

const requestIdSchema = GraphRebuildRequestSchema.shape.id;

export const GraphRebuildCreateSchema = z
  .object({
    mode: GraphRebuildModeSchema,
  })
  .strict()
  .meta({ id: 'GraphRebuildCreate' });

export const GraphRebuildAcceptedSchema = z
  .object({
    requestId: requestIdSchema,
    status: z.literal('accepted'),
    mode: GraphRebuildModeSchema,
    acceptedAt: z.iso.datetime(),
    coalesced: z.boolean(),
  })
  .strict()
  .meta({ id: 'GraphRebuildAccepted' });

export const GraphRebuildListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()
  .meta({ id: 'GraphRebuildListQuery' });

export const GraphRebuildProgressSchema = z
  .object({
    requestId: requestIdSchema,
    mode: GraphRebuildModeSchema,
    status: GraphRebuildStatusSchema,
    phase: GraphRebuildRequestSchema.shape.phase,
    pagesCommitted: GraphRebuildRequestSchema.shape.pagesCommitted,
    projectionIntents: GraphRebuildRequestSchema.shape.projectionIntents,
    semanticRequests: GraphRebuildRequestSchema.shape.semanticRequests,
    skippedDeleted: GraphRebuildRequestSchema.shape.skippedDeleted,
    failedSources: GraphRebuildRequestSchema.shape.failedSources,
    lastErrorCode: GraphRebuildRequestSchema.shape.lastErrorCode,
    acceptedAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict()
  .meta({ id: 'GraphRebuildProgress' });

export const GraphRebuildListSchema = z
  .object({
    items: GraphRebuildProgressSchema.array(),
  })
  .strict()
  .meta({ id: 'GraphRebuildList' });

export const GraphRebuildCancelSchema = z
  .object({})
  .strict()
  .meta({ id: 'GraphRebuildCancel' });

export const GraphRebuildCancelAcceptedSchema = z
  .object({
    requestId: requestIdSchema,
    status: GraphRebuildStatusSchema,
  })
  .strict()
  .meta({ id: 'GraphRebuildCancelAccepted' });

export type GraphRebuildCreate = z.infer<typeof GraphRebuildCreateSchema>;
export type GraphRebuildListQuery = z.infer<typeof GraphRebuildListQuerySchema>;

export class GraphRebuildCreateDto extends createZodDto(
  GraphRebuildCreateSchema,
) {}
export class GraphRebuildAcceptedDto extends createZodDto(
  GraphRebuildAcceptedSchema,
) {}
export class GraphRebuildListQueryDto extends createZodDto(
  GraphRebuildListQuerySchema,
) {}
export class GraphRebuildProgressDto extends createZodDto(
  GraphRebuildProgressSchema,
) {}
export class GraphRebuildListDto extends createZodDto(GraphRebuildListSchema) {}
export class GraphRebuildCancelDto extends createZodDto(
  GraphRebuildCancelSchema,
) {}
export class GraphRebuildCancelAcceptedDto extends createZodDto(
  GraphRebuildCancelAcceptedSchema,
) {}
