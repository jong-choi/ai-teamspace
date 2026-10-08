import { projectSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/project.zod';
import { projectColumnSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.zod';

import type { z } from 'zod';

export const ProjectProjectionSourceSchema = projectSelectSchema
  .pick({
    id: true,
    organizationId: true,
    key: true,
    name: true,
    leadUserId: true,
    createdByUserId: true,
    archivedAt: true,
    updatedAt: true,
  })
  .extend({
    columns: projectColumnSelectSchema
      .pick({ id: true, name: true, position: true, isCompleted: true })
      .array(),
  });
export type ProjectProjectionSource = z.infer<
  typeof ProjectProjectionSourceSchema
>;
