import { wikiEntrySelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.zod.js';

import { z } from 'zod';

export const WikiFolderSchema = wikiEntrySelectSchema
  .pick({
    id: true,
    organizationId: true,
    parentFolderId: true,
    name: true,
    position: true,
    createdByUserId: true,
    createdAt: true,
    updatedAt: true,
  })
  .meta({ id: 'WikiFolderDomain' });

export type WikiFolder = z.infer<typeof WikiFolderSchema>;
