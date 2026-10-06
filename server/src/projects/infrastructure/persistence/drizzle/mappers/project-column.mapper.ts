import type { ProjectColumn } from '@/projects/domain/project-column';
import {
  projectColumnInsertSchema,
  projectColumnSelectSchema,
  projectColumnUpdateSchema,
} from '@/projects/infrastructure/persistence/drizzle/schema/project-column.zod';

import type { z } from 'zod';

export function toProjectColumnDomain(row: unknown): ProjectColumn {
  return projectColumnSelectSchema.parse(row);
}

export function toProjectColumnInsert(
  input: z.input<typeof projectColumnInsertSchema>,
) {
  return projectColumnInsertSchema.parse(input);
}

export function toProjectColumnUpdate(
  input: z.input<typeof projectColumnUpdateSchema>,
) {
  return projectColumnUpdateSchema.parse(input);
}
