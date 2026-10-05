import type { WikiDocument } from '#server/wiki/domain/wiki-document.js';
import { WikiDocumentSchema } from '#server/wiki/domain/wiki-document.js';
import {
  wikiDocumentInsertSchema,
  wikiDocumentUpdateSchema,
} from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod.js';

export function toWikiDocumentDomain(row: unknown): WikiDocument {
  return WikiDocumentSchema.parse(row);
}

export function toWikiDocumentInsert(
  input: Parameters<typeof wikiDocumentInsertSchema.parse>[0],
) {
  return wikiDocumentInsertSchema.parse(input);
}

export function toWikiDocumentUpdate(
  input: Parameters<typeof wikiDocumentUpdateSchema.parse>[0],
) {
  return wikiDocumentUpdateSchema.parse(input);
}
