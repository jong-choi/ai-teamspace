import { ticketLabel } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const ticketLabelNameSchema = z.string().trim().min(1);

const fieldRefinements = {
  name: ticketLabelNameSchema,
};

export const ticketLabelSelectSchema = createSelectSchema(
  ticketLabel,
  fieldRefinements,
);
export const ticketLabelInsertSchema = createInsertSchema(
  ticketLabel,
  fieldRefinements,
);
export const ticketLabelUpdateSchema = createUpdateSchema(
  ticketLabel,
  fieldRefinements,
).partial();
