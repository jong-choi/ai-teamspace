import { createZodDto } from '@/common/dto/create-zod-dto';
import { SemanticIndexStatusSchema } from '@/knowledge-graph/domain/semantic-index-status';
import { SemanticSourceCurrentSchema } from '@/outbox/domain/semantic-source';

import { z } from 'zod';

const semanticStateSchema = SemanticSourceCurrentSchema.shape.state.unwrap();

export const RefreshKnowledgeGraphSchema = z.object({}).strict();
export type RefreshKnowledgeGraphInput = z.infer<
  typeof RefreshKnowledgeGraphSchema
>;

export const RefreshKnowledgeGraphAcceptedSchema = z
  .object({
    requestId: semanticStateSchema.shape.manualRequestId.unwrap(),
    status: z.literal('accepted'),
    sourceUpdatedAt: z.iso.datetime(),
    acceptedAt: z.iso.datetime(),
  })
  .strict()
  .meta({ id: 'RefreshKnowledgeGraphAccepted' });

const latestRequestSchema = z
  .object({
    requestId: semanticStateSchema.shape.manualRequestId.unwrap(),
    requestedAt: z.iso.datetime(),
    satisfied: z.boolean(),
  })
  .strict();

export const WikiKnowledgeGraphStatusSchema = z
  .object({
    graphNodeId: z.string().min(1).max(512),
    status: SemanticIndexStatusSchema,
    sourceUpdatedAt: z.iso.datetime(),
    indexedSourceUpdatedAt: z.iso.datetime().nullable(),
    autoEligibleAt: z.iso.datetime().nullable(),
    requestId: semanticStateSchema.shape.manualRequestId.nullable(),
    requestedAt: z.iso.datetime().nullable(),
    latestRequest: latestRequestSchema.nullable(),
    completedAt: z.iso.datetime().nullable(),
    errorCode: semanticStateSchema.shape.lastErrorCode,
  })
  .strict()
  .meta({ id: 'WikiKnowledgeGraphStatus' });

export type RefreshKnowledgeGraphAccepted = z.infer<
  typeof RefreshKnowledgeGraphAcceptedSchema
>;
export type WikiKnowledgeGraphStatus = z.infer<
  typeof WikiKnowledgeGraphStatusSchema
>;

export class RefreshKnowledgeGraphDto extends createZodDto(
  RefreshKnowledgeGraphSchema,
) {}
export class RefreshKnowledgeGraphAcceptedDto extends createZodDto(
  RefreshKnowledgeGraphAcceptedSchema,
) {}
export class WikiKnowledgeGraphStatusDto extends createZodDto(
  WikiKnowledgeGraphStatusSchema,
) {}
