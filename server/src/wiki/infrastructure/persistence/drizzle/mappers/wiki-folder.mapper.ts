import type { WikiFolder } from '#server/wiki/domain/wiki-folder.js';
import { WikiFolderSchema } from '#server/wiki/domain/wiki-folder.js';
import {
  wikiEntryInsertSchema,
  wikiEntrySelectSchema,
  wikiEntryUpdateSchema,
} from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.zod.js';

export function toWikiFolderDomain(row: unknown): WikiFolder {
  const entry = wikiEntrySelectSchema.parse(row);
  if (entry.kind !== 'folder') {
    throw new Error('위키 폴더 행의 종류가 올바르지 않습니다.');
  }
  return WikiFolderSchema.parse(entry);
}

export function toWikiFolderInsert(input: {
  organizationId: string;
  parentFolderId: string | null;
  name: string;
  position: number;
  createdByUserId: string;
}) {
  return wikiEntryInsertSchema.parse({
    ...input,
    kind: 'folder',
  });
}

export function toWikiFolderUpdate(input: {
  parentFolderId: string | null;
  name: string;
  position: number;
  updatedAt: Date;
}) {
  return wikiEntryUpdateSchema.parse(input);
}
