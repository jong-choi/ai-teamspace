import { projectColumnSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.zod';

import { z } from 'zod';

export const ProjectColumnSchema = projectColumnSelectSchema.meta({
  id: 'ProjectColumnDomain',
});

export type ProjectColumn = z.infer<typeof ProjectColumnSchema>;
