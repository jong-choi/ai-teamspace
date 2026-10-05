import { wikiDocumentEditLockSelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-edit-lock.zod.js';

import { z } from 'zod';

export const WIKI_EDIT_LOCK_LEASE_SECONDS = 60;

export const WikiEditLockSchema = wikiDocumentEditLockSelectSchema.meta({
  id: 'WikiEditLockDomain',
});

export type WikiEditLock = z.infer<typeof WikiEditLockSchema>;
