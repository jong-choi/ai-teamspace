import { ticketChecklist } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.schema.js';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const ticketChecklistTitleSchema = z.string().trim().min(1);
export const ticketChecklistPositionSchema = z.number().int().nonnegative();

const fieldRefinements = {
  title: ticketChecklistTitleSchema,
  position: ticketChecklistPositionSchema,
};

export const ticketChecklistSelectSchema = createSelectSchema(
  ticketChecklist,
  fieldRefinements,
);
export const ticketChecklistInsertSchema = createInsertSchema(
  ticketChecklist,
  fieldRefinements,
);
export const ticketChecklistUpdateSchema = createUpdateSchema(
  ticketChecklist,
  fieldRefinements,
).partial();
