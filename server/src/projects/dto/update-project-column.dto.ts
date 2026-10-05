import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { projectColumnInsertSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/project-column.zod.js';

import { z } from 'zod';

export const UpdateProjectColumnSchema = z
  .object({
    name: projectColumnInsertSchema.shape.name,
  })
  .meta({ id: 'UpdateProjectColumn' });

export type UpdateProjectColumnInput = z.infer<
  typeof UpdateProjectColumnSchema
>;

export class UpdateProjectColumnDto extends createZodDto(
  UpdateProjectColumnSchema,
) {}
