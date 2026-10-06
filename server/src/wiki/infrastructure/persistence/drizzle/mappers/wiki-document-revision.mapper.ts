import type { WikiDocumentRevision } from '@/wiki/domain/wiki-document-revision';
import { WikiDocumentRevisionSchema } from '@/wiki/domain/wiki-document-revision';
import {
  wikiDocumentRevisionInsertSchema,
  wikiDocumentRevisionSelectSchema,
} from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.zod';

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
