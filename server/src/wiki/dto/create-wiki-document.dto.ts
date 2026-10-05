import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { wikiDocumentInsertSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod.js';

import { z } from 'zod';

export const CreateWikiDocumentSchema = z
  .object({
    parentDocumentId:
      wikiDocumentInsertSchema.shape.parentDocumentId.optional(),
    title: wikiDocumentInsertSchema.shape.title,
    position: wikiDocumentInsertSchema.shape.position.optional(),
    contentMarkdown: wikiDocumentInsertSchema.shape.contentMarkdown.optional(),
  })
  .meta({ id: 'CreateWikiDocument' });

export type CreateWikiDocumentInput = z.infer<typeof CreateWikiDocumentSchema>;

export class CreateWikiDocumentDto extends createZodDto(
  CreateWikiDocumentSchema,
) {}
