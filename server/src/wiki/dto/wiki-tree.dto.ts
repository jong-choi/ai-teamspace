import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import type { WikiDocumentSummary } from '#server/wiki/domain/wiki-document.js';
import type { WikiFolder } from '#server/wiki/domain/wiki-folder.js';
import { WikiDocumentSchema } from '#server/wiki/dto/wiki-document.dto.js';
import {
  toWikiFolderResponse,
  WikiFolderSchema,
} from '#server/wiki/dto/wiki-folder.dto.js';

import { z } from 'zod';

export const WikiTreeDocumentSchema = WikiDocumentSchema.omit({
  contentMarkdown: true,
}).meta({ id: 'WikiTreeDocument' });

export const WikiTreeSchema = z
  .object({
    folders: z.array(WikiFolderSchema),
    documents: z.array(WikiTreeDocumentSchema),
  })
  .meta({ id: 'WikiTree' });

export type WikiTreeResponse = z.infer<typeof WikiTreeSchema>;

export function toWikiTreeResponse(input: {
  folders: WikiFolder[];
  documents: WikiDocumentSummary[];
}): WikiTreeResponse {
  return WikiTreeSchema.parse({
    folders: input.folders.map(toWikiFolderResponse),
    documents: input.documents.map((document) =>
      WikiTreeDocumentSchema.parse({
        ...document,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      }),
    ),
  });
}

export class WikiTreeDto extends createZodDto(WikiTreeSchema) {}
