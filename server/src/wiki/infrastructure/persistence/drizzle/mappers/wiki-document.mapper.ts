import type { WikiDocument } from '@/wiki/domain/wiki-document';
import { WikiDocumentSchema } from '@/wiki/domain/wiki-document';
import {
  wikiDocumentInsertSchema,
  wikiDocumentUpdateSchema,
} from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod';

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
