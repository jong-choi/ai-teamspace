import { wikiDocumentEditLock } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-edit-lock.schema.js';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

export const wikiDocumentEditLockSelectSchema =
  createSelectSchema(wikiDocumentEditLock);
export const wikiDocumentEditLockInsertSchema =
  createInsertSchema(wikiDocumentEditLock);
export const wikiDocumentEditLockUpdateSchema =
  createUpdateSchema(wikiDocumentEditLock);
