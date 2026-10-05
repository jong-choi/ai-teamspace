import type { WikiDocumentRevision } from '#server/wiki/domain/wiki-document-revision.js';
import { WikiDocumentRevisionSchema } from '#server/wiki/domain/wiki-document-revision.js';
import {
  wikiDocumentRevisionInsertSchema,
  wikiDocumentRevisionSelectSchema,
} from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.zod.js';

export function toWikiDocumentRevisionDomain(
  row: unknown,
  collaboratorUserIds: readonly string[],
): WikiDocumentRevision {
  return WikiDocumentRevisionSchema.parse({
    ...wikiDocumentRevisionSelectSchema.parse(row),
    collaboratorUserIds,
  });
}

export function toWikiDocumentRevisionInsert(input: {
  documentId: string;
  organizationId: string;
  revision: number;
  editorUserId: string;
  contentMarkdown: string;
  createdAt?: Date;
}) {
  return wikiDocumentRevisionInsertSchema.parse(input);
}
