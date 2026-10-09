import { createZodDto } from '@/common/dto/create-zod-dto';
import {
  CreateCuratedEdgeSchema,
  CreateCuratedNodeSchema,
  curatedEdgeSelectSchema,
  curatedNodeSelectSchema,
  UpdateCuratedEdgeSchema,
  UpdateCuratedNodeSchema,
} from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-graph.zod';

import { z } from 'zod';

const expectedRevisionSchema = z.coerce.number().int().nonnegative();
const endpointKindSchema = z.enum([
  'curated_node',
  'wiki_document',
  'project',
  'ticket',
  'meeting',
]);
const isoDateTimeSchema = z.iso.datetime();

export const CreateCuratedNodeCommandSchema =
  CreateCuratedNodeSchema.strict().meta({
    id: 'CreateCuratedNodeCommand',
  });
export const UpdateCuratedNodeCommandSchema = UpdateCuratedNodeSchema.extend({
  expectedRevision: expectedRevisionSchema,
})
  .strict()
  .meta({ id: 'UpdateCuratedNodeCommand' });
export const DeleteCuratedNodeCommandQuerySchema = z
  .object({ expectedRevision: expectedRevisionSchema })
  .strict()
  .meta({ id: 'DeleteCuratedNodeCommandQuery' });

export const CreateCuratedEdgeCommandSchema =
  CreateCuratedEdgeSchema.strict().meta({
    id: 'CreateCuratedEdgeCommand',
  });
export const UpdateCuratedEdgeCommandSchema = UpdateCuratedEdgeSchema.extend({
  expectedRevision: expectedRevisionSchema,
})
  .strict()
  .meta({ id: 'UpdateCuratedEdgeCommand' });
export const DeleteCuratedEdgeCommandQuerySchema = z
  .object({ expectedRevision: expectedRevisionSchema })
  .strict()
  .meta({ id: 'DeleteCuratedEdgeCommandQuery' });

export const CuratedGraphNodeCommandResultSchema = curatedNodeSelectSchema
  .pick({ id: true, kind: true, title: true, properties: true, revision: true })
  .extend({
    updatedAt: isoDateTimeSchema,
    projectionState: z.literal('pending'),
  })
  .strict()
  .meta({ id: 'CuratedGraphNodeCommandResult' });
export const CuratedGraphEdgeCommandResultSchema = curatedEdgeSelectSchema
  .pick({
    id: true,
    sourceNodeKind: true,
    sourceNodeId: true,
    targetNodeKind: true,
    targetNodeId: true,
    predicate: true,
    directed: true,
    properties: true,
    revision: true,
  })
  .extend({
    updatedAt: isoDateTimeSchema,
    projectionState: z.literal('pending'),
  })
  .strict()
  .meta({ id: 'CuratedGraphEdgeCommandResult' });

export const CuratedEndpointOptionsQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    kind: endpointKindSchema.optional(),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict()
  .meta({ id: 'CuratedEndpointOptionsQuery' });
export const CuratedEndpointOptionSchema = z
  .object({
    nodeId: z.uuid(),
    kind: endpointKindSchema,
    title: z.string().min(1).max(500),
    allowedPredicates: z.array(curatedEdgeSelectSchema.shape.predicate).min(1),
  })
  .strict();
export const CuratedEndpointOptionsSchema = z
  .object({ items: z.array(CuratedEndpointOptionSchema) })
  .strict()
  .meta({ id: 'CuratedEndpointOptions' });

export type CreateCuratedNodeCommandInput = z.infer<
  typeof CreateCuratedNodeCommandSchema
>;
export type UpdateCuratedNodeCommandInput = z.infer<
  typeof UpdateCuratedNodeCommandSchema
>;
export type DeleteCuratedNodeCommandQuery = z.infer<
  typeof DeleteCuratedNodeCommandQuerySchema
>;
export type CreateCuratedEdgeCommandInput = z.infer<
  typeof CreateCuratedEdgeCommandSchema
>;
export type UpdateCuratedEdgeCommandInput = z.infer<
  typeof UpdateCuratedEdgeCommandSchema
>;
export type DeleteCuratedEdgeCommandQuery = z.infer<
  typeof DeleteCuratedEdgeCommandQuerySchema
>;
export type CuratedEndpointOptionsQuery = z.infer<
  typeof CuratedEndpointOptionsQuerySchema
>;

export class CreateCuratedNodeCommandDto extends createZodDto(
  CreateCuratedNodeCommandSchema,
) {}
export class UpdateCuratedNodeCommandDto extends createZodDto(
  UpdateCuratedNodeCommandSchema,
) {}
export class DeleteCuratedNodeCommandQueryDto extends createZodDto(
  DeleteCuratedNodeCommandQuerySchema,
) {}
export class CreateCuratedEdgeCommandDto extends createZodDto(
  CreateCuratedEdgeCommandSchema,
) {}
export class UpdateCuratedEdgeCommandDto extends createZodDto(
  UpdateCuratedEdgeCommandSchema,
) {}
export class DeleteCuratedEdgeCommandQueryDto extends createZodDto(
  DeleteCuratedEdgeCommandQuerySchema,
) {}
export class CuratedGraphNodeCommandResultDto extends createZodDto(
  CuratedGraphNodeCommandResultSchema,
) {}
export class CuratedGraphEdgeCommandResultDto extends createZodDto(
  CuratedGraphEdgeCommandResultSchema,
) {}
export class CuratedEndpointOptionsQueryDto extends createZodDto(
  CuratedEndpointOptionsQuerySchema,
) {}
export class CuratedEndpointOptionsDto extends createZodDto(
  CuratedEndpointOptionsSchema,
) {}
