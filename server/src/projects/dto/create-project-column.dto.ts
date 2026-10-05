import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { projectColumnInsertSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/project-column.zod.js';

import { z } from 'zod';

export const CreateProjectColumnSchema = z
  .object({
    name: projectColumnInsertSchema.shape.name,
  })
  .meta({ id: 'CreateProjectColumn' });

export type CreateProjectColumnInput = z.infer<
  typeof CreateProjectColumnSchema
>;

export class CreateProjectColumnDto extends createZodDto(
  CreateProjectColumnSchema,
) {}
