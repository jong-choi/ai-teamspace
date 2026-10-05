import { ticket } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.schema.js';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const ticketTitleSchema = z.string().trim().min(1);
export const ticketPositionSchema = z.number().int().nonnegative();
const ticketUserIdSchema = z.string().min(1);

const fieldRefinements = {
  title: ticketTitleSchema,
  position: ticketPositionSchema,
  assigneeUserId: ticketUserIdSchema.nullable(),
  reporterUserId: ticketUserIdSchema,
};

export const ticketSelectSchema = createSelectSchema(ticket, fieldRefinements);
export const ticketInsertSchema = createInsertSchema(ticket, fieldRefinements);
export const ticketUpdateSchema = createUpdateSchema(
  ticket,
  fieldRefinements,
).partial();
