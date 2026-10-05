import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import type { WikiFolder } from '#server/wiki/domain/wiki-folder.js';
import { WikiFolderSchema as WikiFolderDomainSchema } from '#server/wiki/domain/wiki-folder.js';

import { z } from 'zod';

export const WikiFolderSchema = WikiFolderDomainSchema.omit({
  createdAt: true,
  updatedAt: true,
})
  .extend({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'WikiFolder' });

export type WikiFolderResponse = z.infer<typeof WikiFolderSchema>;

export function toWikiFolderResponse(folder: WikiFolder): WikiFolderResponse {
  return WikiFolderSchema.parse({
    ...folder,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  });
}

export class WikiFolderDto extends createZodDto(WikiFolderSchema) {}
