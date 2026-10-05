import type { ProjectColumn } from '#server/projects/domain/project-column.js';
import {
  projectColumnInsertSchema,
  projectColumnSelectSchema,
  projectColumnUpdateSchema,
} from '#server/projects/infrastructure/persistence/drizzle/schema/project-column.zod.js';

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
