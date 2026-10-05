import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { wikiDocumentInsertSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod.js';
import { wikiEntryInsertSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.zod.js';

import { z } from 'zod';

export const CreateWikiDocumentSchema = z
  .object({
    folderId: wikiEntryInsertSchema.shape.parentFolderId.optional(),
    title: wikiEntryInsertSchema.shape.name,
    contentMarkdown: wikiDocumentInsertSchema.shape.contentMarkdown.optional(),
  })
  .meta({ id: 'CreateWikiDocument' });

export type CreateWikiDocumentInput = z.infer<typeof CreateWikiDocumentSchema>;

export class CreateWikiDocumentDto extends createZodDto(
  CreateWikiDocumentSchema,
) {}
