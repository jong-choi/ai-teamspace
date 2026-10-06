import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const projectKeySchema = z
  .string()
  .min(1)
  .max(12)
  .regex(/^[A-Z][A-Z0-9]*$/);
export const projectNameSchema = z.string().trim().min(1);
const projectUserIdSchema = z.string().min(1);

const fieldRefinements = {
  key: projectKeySchema,
  name: projectNameSchema,
  leadUserId: projectUserIdSchema.nullable(),
  createdByUserId: projectUserIdSchema,
};

export const projectSelectSchema = createSelectSchema(
  project,
  fieldRefinements,
);
export const projectInsertSchema = createInsertSchema(
  project,
  fieldRefinements,
);
export const projectUpdateSchema = createUpdateSchema(
  project,
  fieldRefinements,
).partial();
