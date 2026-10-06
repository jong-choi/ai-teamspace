import { createZodDto } from '@/common/dto/create-zod-dto';
import { projectColumnUpdateSchema } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.zod';

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
