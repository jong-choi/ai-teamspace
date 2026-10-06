import type { Project } from '@/projects/domain/project';
import {
  projectInsertSchema,
  projectSelectSchema,
  projectUpdateSchema,
} from '@/projects/infrastructure/persistence/drizzle/schema/project.zod';

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
