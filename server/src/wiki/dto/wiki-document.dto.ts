import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import type { WikiDocument } from '#server/wiki/domain/wiki-document.js';
import { WikiDocumentSchema as WikiDocumentDomainSchema } from '#server/wiki/domain/wiki-document.js';

import { z } from 'zod';

export const WikiDocumentSchema = WikiDocumentDomainSchema.omit({
  createdAt: true,
  updatedAt: true,
})
  .extend({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'WikiDocument' });

export type WikiDocumentResponse = z.infer<typeof WikiDocumentSchema>;

export function toWikiDocumentResponse(
  document: WikiDocument,
): WikiDocumentResponse {
  return WikiDocumentSchema.parse({
    ...document,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  });
}

export class WikiDocumentDto extends createZodDto(WikiDocumentSchema) {}
