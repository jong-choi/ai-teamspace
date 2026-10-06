import { wikiCollection } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-collection.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

export const wikiCollectionSelectSchema = createSelectSchema(wikiCollection);
export const wikiCollectionInsertSchema = createInsertSchema(wikiCollection);
export const wikiCollectionUpdateSchema = createUpdateSchema(wikiCollection);
