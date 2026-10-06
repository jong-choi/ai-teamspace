import { createZodDto } from '@/common/dto/create-zod-dto';
import type { WikiDocument } from '@/wiki/domain/wiki-document';
import { WikiDocumentSchema as WikiDocumentDomainSchema } from '@/wiki/domain/wiki-document';

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
