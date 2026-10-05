import { wikiDocument } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema.js';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const wikiCollaborationStateBinarySchema = z.instanceof(Uint8Array);
export const wikiDocumentTitleSchema = z.string().trim().min(1);
export const wikiDocumentPositionSchema = z.number().int().min(0);

const fieldRefinements = {
  title: wikiDocumentTitleSchema,
  position: wikiDocumentPositionSchema,
  collaborationState: wikiCollaborationStateBinarySchema,
};

export const wikiDocumentSelectSchema = createSelectSchema(
  wikiDocument,
  fieldRefinements,
);
export const wikiDocumentInsertSchema = createInsertSchema(
  wikiDocument,
  fieldRefinements,
);
export const wikiDocumentUpdateSchema = createUpdateSchema(
  wikiDocument,
  fieldRefinements,
).partial();
