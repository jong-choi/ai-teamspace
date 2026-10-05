import type { WikiDocument } from '#server/wiki/domain/wiki-document.js';
import { WikiDocumentSchema } from '#server/wiki/domain/wiki-document.js';
import {
  wikiDocumentInsertSchema,
  wikiDocumentSelectSchema,
  wikiDocumentUpdateSchema,
} from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod.js';
import {
  wikiEntryInsertSchema,
  wikiEntrySelectSchema,
  wikiEntryUpdateSchema,
} from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.zod.js';

export function toWikiDocumentDomain(input: {
  entry: unknown;
  document: unknown;
}): WikiDocument {
  const entry = wikiEntrySelectSchema.parse(input.entry);
  const document = wikiDocumentSelectSchema.parse(input.document);
  if (entry.kind !== 'document' || entry.id !== document.id) {
    throw new Error('위키 문서 행의 관계가 올바르지 않습니다.');
  }

  return WikiDocumentSchema.parse({
    id: entry.id,
    organizationId: entry.organizationId,
    folderId: entry.parentFolderId,
    title: entry.name,
    contentMarkdown: document.contentMarkdown,
    revision: document.revision,
    createdByUserId: entry.createdByUserId,
    updatedByUserId: document.updatedByUserId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
}

export function toWikiDocumentEntryInsert(input: {
  organizationId: string;
  folderId: string | null;
  title: string;
  actorUserId: string;
}) {
  return wikiEntryInsertSchema.parse({
    organizationId: input.organizationId,
    parentFolderId: input.folderId,
    kind: 'document',
    name: input.title,
    position: 0,
    createdByUserId: input.actorUserId,
  });
}

export function toWikiDocumentInsert(input: {
  id: string;
  contentMarkdown: string;
  actorUserId: string;
}) {
  return wikiDocumentInsertSchema.parse({
    id: input.id,
    contentMarkdown: input.contentMarkdown,
    revision: 1,
    updatedByUserId: input.actorUserId,
  });
}

export function toWikiDocumentEntryUpdate(input: {
  folderId: string | null;
  title: string;
  updatedAt: Date;
}) {
  return wikiEntryUpdateSchema.parse({
    parentFolderId: input.folderId,
    name: input.title,
    updatedAt: input.updatedAt,
  });
}

export function toWikiDocumentUpdate(input: {
  contentMarkdown?: string;
  revision?: number;
  actorUserId: string;
}) {
  return wikiDocumentUpdateSchema.parse({
    ...(input.contentMarkdown === undefined
      ? {}
      : { contentMarkdown: input.contentMarkdown }),
    ...(input.revision === undefined ? {} : { revision: input.revision }),
    updatedByUserId: input.actorUserId,
  });
}
