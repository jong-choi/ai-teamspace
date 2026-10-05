import type { WikiEditLock } from '#server/wiki/domain/wiki-edit-lock.js';
import { WikiEditLockSchema } from '#server/wiki/domain/wiki-edit-lock.js';
import { wikiDocumentEditLockSelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-edit-lock.zod.js';

export function toWikiEditLockDomain(row: unknown): WikiEditLock {
  return WikiEditLockSchema.parse(wikiDocumentEditLockSelectSchema.parse(row));
}
