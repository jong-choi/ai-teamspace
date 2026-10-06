import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { projectColumnUpdateSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/project-column.zod.js';

import { z } from 'zod';

export const UpdateProjectColumnSchema = projectColumnUpdateSchema
  .pick({ name: true })
  .required({ name: true })
  .meta({ id: 'UpdateProjectColumn' });

export type UpdateProjectColumnInput = z.infer<
  typeof UpdateProjectColumnSchema
>;

export class UpdateProjectColumnDto extends createZodDto(
  UpdateProjectColumnSchema,
) {}
