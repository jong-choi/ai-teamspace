import { ticketChecklistItem } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const ticketChecklistItemTitleSchema = z.string().trim().min(1);
export const ticketChecklistItemPositionSchema = z.number().int().nonnegative();

const fieldRefinements = {
  title: ticketChecklistItemTitleSchema,
  position: ticketChecklistItemPositionSchema,
};

export const ticketChecklistItemSelectSchema = createSelectSchema(
  ticketChecklistItem,
  fieldRefinements,
);
export const ticketChecklistItemInsertSchema = createInsertSchema(
  ticketChecklistItem,
  fieldRefinements,
);
export const ticketChecklistItemUpdateSchema = createUpdateSchema(
  ticketChecklistItem,
  fieldRefinements,
).partial();
