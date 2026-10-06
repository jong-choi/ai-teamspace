import { createZodDto } from '@/common/dto/create-zod-dto';
import { projectColumnInsertSchema } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.zod';

import { z } from 'zod';

export const CreateProjectColumnSchema = projectColumnInsertSchema
  .pick({ name: true })
  .meta({ id: 'CreateProjectColumn' });

export type CreateProjectColumnInput = z.infer<
  typeof CreateProjectColumnSchema
>;

export class CreateProjectColumnDto extends createZodDto(
  CreateProjectColumnSchema,
) {}
