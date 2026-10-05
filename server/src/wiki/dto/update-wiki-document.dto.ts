import { wikiEntrySelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.zod.js';

import { z } from 'zod';

const optionalDocumentMetadataFields = {
  folderId: wikiEntrySelectSchema.shape.parentFolderId.optional(),
  title: wikiEntrySelectSchema.shape.name.optional(),
};

export const UpdateWikiDocumentSchema = z
  .union([
    z.object({
      ...optionalDocumentMetadataFields,
      folderId: wikiEntrySelectSchema.shape.parentFolderId,
    }),
    z.object({
      ...optionalDocumentMetadataFields,
      title: wikiEntrySelectSchema.shape.name,
    }),
  ])
  .meta({ id: 'UpdateWikiDocument' });

export type UpdateWikiDocumentInput = z.infer<typeof UpdateWikiDocumentSchema>;

export class UpdateWikiDocumentDto {
  static readonly schema = UpdateWikiDocumentSchema;
}
