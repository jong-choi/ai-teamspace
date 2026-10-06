import { projectColumn } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const projectColumnNameSchema = z.string().trim().min(1);
export const projectColumnPositionSchema = z.number().int().nonnegative();

const fieldRefinements = {
  name: projectColumnNameSchema,
  position: projectColumnPositionSchema,
};

export const projectColumnSelectSchema = createSelectSchema(
  projectColumn,
  fieldRefinements,
);
export const projectColumnInsertSchema = createInsertSchema(
  projectColumn,
  fieldRefinements,
);
export const projectColumnUpdateSchema = createUpdateSchema(
  projectColumn,
  fieldRefinements,
).partial();
