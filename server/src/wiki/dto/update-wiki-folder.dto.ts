import { wikiEntrySelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.zod.js';

import { z } from 'zod';

const optionalFolderUpdateFields = {
  name: wikiEntrySelectSchema.shape.name.optional(),
  parentFolderId: wikiEntrySelectSchema.shape.parentFolderId.optional(),
  position: wikiEntrySelectSchema.shape.position.optional(),
};

export const UpdateWikiFolderSchema = z
  .union([
    z.object({
      ...optionalFolderUpdateFields,
      name: wikiEntrySelectSchema.shape.name,
    }),
    z.object({
      ...optionalFolderUpdateFields,
      parentFolderId: wikiEntrySelectSchema.shape.parentFolderId,
    }),
    z.object({
      ...optionalFolderUpdateFields,
      position: wikiEntrySelectSchema.shape.position,
    }),
  ])
  .meta({ id: 'UpdateWikiFolder' });

export type UpdateWikiFolderInput = z.infer<typeof UpdateWikiFolderSchema>;

export class UpdateWikiFolderDto {
  static readonly schema = UpdateWikiFolderSchema;
}
