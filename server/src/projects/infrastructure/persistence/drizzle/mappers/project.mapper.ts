import type { Project } from '#server/projects/domain/project.js';
import {
  projectInsertSchema,
  projectSelectSchema,
  projectUpdateSchema,
} from '#server/projects/infrastructure/persistence/drizzle/schema/project.zod.js';

import type { z } from 'zod';

export function toProjectDomain(row: unknown): Project {
  return projectSelectSchema.parse(row);
}

export function toProjectInsert(input: z.input<typeof projectInsertSchema>) {
  return projectInsertSchema.parse(input);
}

export function toProjectUpdate(input: z.input<typeof projectUpdateSchema>) {
  return projectUpdateSchema.parse(input);
}
