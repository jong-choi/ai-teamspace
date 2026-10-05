import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { wikiEntryInsertSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.zod.js';

import { z } from 'zod';

export const CreateWikiFolderSchema = wikiEntryInsertSchema
  .pick({
    name: true,
    parentFolderId: true,
    position: true,
  })
  .extend({
    parentFolderId: wikiEntryInsertSchema.shape.parentFolderId.optional(),
    position: wikiEntryInsertSchema.shape.position.optional(),
  })
  .meta({ id: 'CreateWikiFolder' });

export type CreateWikiFolderInput = z.infer<typeof CreateWikiFolderSchema>;

export class CreateWikiFolderDto extends createZodDto(CreateWikiFolderSchema) {}
