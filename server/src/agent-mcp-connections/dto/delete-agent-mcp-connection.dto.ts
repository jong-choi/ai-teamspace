import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const DeleteAgentMcpConnectionQuerySchema = z
  .object({
    expectedRevision: z.coerce.number().int().nonnegative(),
  })
  .meta({ id: 'DeleteAgentMcpConnectionQuery' });

export type DeleteAgentMcpConnectionQueryInput = z.infer<
  typeof DeleteAgentMcpConnectionQuerySchema
>;

export class DeleteAgentMcpConnectionQueryDto extends createZodDto(
  DeleteAgentMcpConnectionQuerySchema,
) {}
