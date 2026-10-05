import { projectColumnSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/project-column.zod.js';

import { z } from 'zod';

export const ProjectColumnSchema = projectColumnSelectSchema.meta({
  id: 'ProjectColumnDomain',
});

export type ProjectColumn = z.infer<typeof ProjectColumnSchema>;
