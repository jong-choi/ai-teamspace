import { projectSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/project.zod';

import { z } from 'zod';

export const ProjectSchema = projectSelectSchema.meta({ id: 'ProjectDomain' });

export type Project = z.infer<typeof ProjectSchema>;
