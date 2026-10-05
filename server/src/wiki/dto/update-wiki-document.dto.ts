import { wikiDocumentSelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod.js';
import { wikiEntrySelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.zod.js';

import { z } from 'zod';

const optionalDocumentUpdateFields = {
  folderId: wikiEntrySelectSchema.shape.parentFolderId.optional(),
  title: wikiEntrySelectSchema.shape.name.optional(),
  contentMarkdown: wikiDocumentSelectSchema.shape.contentMarkdown.optional(),
};

export const UpdateWikiDocumentSchema = z
  .union([
    z.object({
      ...optionalDocumentUpdateFields,
      folderId: wikiEntrySelectSchema.shape.parentFolderId,
    }),
    z.object({
      ...optionalDocumentUpdateFields,
      title: wikiEntrySelectSchema.shape.name,
    }),
    z.object({
      ...optionalDocumentUpdateFields,
      contentMarkdown: wikiDocumentSelectSchema.shape.contentMarkdown,
    }),
  ])
  .meta({ id: 'UpdateWikiDocument' });

export type UpdateWikiDocumentInput = z.infer<typeof UpdateWikiDocumentSchema>;

export class UpdateWikiDocumentDto {
  static readonly schema = UpdateWikiDocumentSchema;
}
