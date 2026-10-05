import { wikiCollection } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-collection.schema.js';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

export const wikiCollectionSelectSchema = createSelectSchema(wikiCollection);
export const wikiCollectionInsertSchema = createInsertSchema(wikiCollection);
export const wikiCollectionUpdateSchema = createUpdateSchema(wikiCollection);
