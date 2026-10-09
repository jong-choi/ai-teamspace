import { createZodDto } from '@/common/dto/create-zod-dto';
import { SemanticCorrectionSchema } from '@/knowledge-graph/domain/semantic-correction';
import { semanticOntology } from '@/knowledge-graph/domain/semantic-pipeline';

import { z } from 'zod';

const graphIdSchema = z.string().min(1).max(512);
const isoDateTimeSchema = z.iso.datetime();
const correctionCommandActionSchema = z.enum([
  'label_override',
  'suppress',
  'correct_predicate',
]);
const labelValueSchema = z
  .object({ label: z.string().trim().min(1).max(200) })
  .strict();
export const SemanticRelationshipSchema = z
  .enum(semanticOntology.allowedRelationships)
  .meta({ id: 'SemanticRelationship' });
const predicateValueSchema = z
  .object({ predicate: SemanticRelationshipSchema })
  .strict();

export const CreateSemanticCorrectionCommandSchema = z
  .object({
    action: correctionCommandActionSchema,
    nodeId: graphIdSchema.optional(),
    edgeId: graphIdSchema.optional(),
    value: z.union([labelValueSchema, predicateValueSchema]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === 'label_override') {
      if (!value.nodeId)
        context.addIssue({ code: 'custom', message: 'nodeId가 필요합니다.' });
      if (!value.value || !('label' in value.value))
        context.addIssue({
          code: 'custom',
          message: 'label value가 필요합니다.',
        });
    }
    if (value.action === 'suppress') {
      if (Boolean(value.nodeId) === Boolean(value.edgeId))
        context.addIssue({
          code: 'custom',
          message: 'nodeId 또는 edgeId 중 하나만 필요합니다.',
        });
      if (value.value)
        context.addIssue({
          code: 'custom',
          message: 'value를 받을 수 없습니다.',
        });
    }
    if (value.action === 'correct_predicate') {
      if (!value.edgeId)
        context.addIssue({ code: 'custom', message: 'edgeId가 필요합니다.' });
      if (!value.value || !('predicate' in value.value))
        context.addIssue({
          code: 'custom',
          message: 'predicate value가 필요합니다.',
        });
    }
  })
  .meta({ id: 'CreateSemanticCorrectionCommand' });

export const UpdateSemanticCorrectionCommandSchema = z
  .object({
    value: z.object({ label: z.string().trim().min(1).max(200) }).strict(),
  })
  .strict()
  .meta({ id: 'UpdateSemanticCorrectionCommand' });

export const QuerySemanticCorrectionsSchema = z
  .object({
    nodeId: graphIdSchema.optional(),
    sourceId: z.uuid().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.nodeId) !== Boolean(value.sourceId), {
    message: 'nodeId 또는 sourceId 중 하나만 필요합니다.',
  })
  .meta({ id: 'QuerySemanticCorrections' });

export const SemanticCorrectionCommandResultSchema = z
  .object({
    correctionId: z.uuid(),
    linkedCorrectionId: z.uuid().nullable(),
    action: correctionCommandActionSchema,
    editRevision: z.number().int().nonnegative(),
    matchState: z.literal('matched'),
  })
  .strict()
  .meta({ id: 'SemanticCorrectionCommandResult' });

export const SemanticCorrectionItemSchema = SemanticCorrectionSchema.pick({
  id: true,
  linkedCorrectionId: true,
  targetKind: true,
  action: true,
  anchor: true,
  value: true,
  createdRevision: true,
  lastMatchState: true,
  lastMatchedGenerationId: true,
}).extend({ createdAt: isoDateTimeSchema });
export const SemanticCorrectionsSchema = z
  .object({
    editRevision: z.number().int().nonnegative(),
    items: z.array(SemanticCorrectionItemSchema),
  })
  .strict()
  .meta({ id: 'SemanticCorrections' });

export type CreateSemanticCorrectionCommandInput = z.infer<
  typeof CreateSemanticCorrectionCommandSchema
>;
export type UpdateSemanticCorrectionCommandInput = z.infer<
  typeof UpdateSemanticCorrectionCommandSchema
>;
export type QuerySemanticCorrectionsInput = z.infer<
  typeof QuerySemanticCorrectionsSchema
>;

export class CreateSemanticCorrectionCommandDto extends createZodDto(
  CreateSemanticCorrectionCommandSchema,
) {}
export class UpdateSemanticCorrectionCommandDto extends createZodDto(
  UpdateSemanticCorrectionCommandSchema,
) {}
export class QuerySemanticCorrectionsDto extends createZodDto(
  QuerySemanticCorrectionsSchema,
) {}
export class SemanticCorrectionCommandResultDto extends createZodDto(
  SemanticCorrectionCommandResultSchema,
) {}
export class SemanticCorrectionsDto extends createZodDto(
  SemanticCorrectionsSchema,
) {}
