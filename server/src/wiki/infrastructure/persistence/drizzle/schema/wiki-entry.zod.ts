import { wikiEntry } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.schema.js';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

const wikiEntryNameSchema = z.string().trim().min(1);

export const wikiEntrySelectSchema = createSelectSchema(wikiEntry, {
  name: wikiEntryNameSchema,
});

export const wikiEntryInsertSchema = createInsertSchema(wikiEntry, {
  name: wikiEntryNameSchema,
});

export const wikiEntryUpdateSchema = createUpdateSchema(wikiEntry, {
  name: wikiEntryNameSchema,
});
