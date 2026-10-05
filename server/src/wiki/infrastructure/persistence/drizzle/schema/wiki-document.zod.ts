import { wikiDocument } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema.js';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

export const wikiDocumentSelectSchema = createSelectSchema(wikiDocument);
export const wikiDocumentInsertSchema = createInsertSchema(wikiDocument);
export const wikiDocumentUpdateSchema = createUpdateSchema(wikiDocument);
