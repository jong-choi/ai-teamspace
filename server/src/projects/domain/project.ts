import { projectSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/project.zod.js';

import { z } from 'zod';

export const ProjectSchema = projectSelectSchema.meta({ id: 'ProjectDomain' });

export type Project = z.infer<typeof ProjectSchema>;
