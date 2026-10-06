import { createZodDto } from '@/common/dto/create-zod-dto';
import type {
  WikiDocumentRevision,
  WikiDocumentRevisionSummary,
} from '@/wiki/domain/wiki-document-revision';
import { WikiDocumentRevisionSchema as WikiDocumentRevisionDomainSchema } from '@/wiki/domain/wiki-document-revision';

import { z } from 'zod';

export const WikiDocumentRevisionSchema = WikiDocumentRevisionDomainSchema.omit(
  {
    createdAt: true,
  },
)
  .extend({ createdAt: z.string().datetime() })
  .meta({ id: 'WikiDocumentRevision' });

export const WikiDocumentRevisionSummarySchema =
  WikiDocumentRevisionSchema.omit({
    contentMarkdown: true,
  }).meta({ id: 'WikiDocumentRevisionSummary' });

export const WikiDocumentHistorySchema = z
  .object({ items: z.array(WikiDocumentRevisionSummarySchema) })
  .meta({ id: 'WikiDocumentHistory' });

export type WikiDocumentRevisionResponse = z.infer<
  typeof WikiDocumentRevisionSchema
>;
export type WikiDocumentRevisionSummaryResponse = z.infer<
  typeof WikiDocumentRevisionSummarySchema
>;
export type WikiDocumentHistoryResponse = z.infer<
  typeof WikiDocumentHistorySchema
>;

export function toWikiDocumentRevisionResponse(
  revision: WikiDocumentRevision,
): WikiDocumentRevisionResponse {
  return WikiDocumentRevisionSchema.parse({
    ...revision,
    createdAt: revision.createdAt.toISOString(),
  });
}

export function toWikiDocumentRevisionSummaryResponse(
  revision: WikiDocumentRevisionSummary,
): WikiDocumentRevisionSummaryResponse {
  return WikiDocumentRevisionSummarySchema.parse({
    ...revision,
    createdAt: revision.createdAt.toISOString(),
  });
}

export class WikiDocumentRevisionDto extends createZodDto(
  WikiDocumentRevisionSchema,
) {}

export class WikiDocumentHistoryDto extends createZodDto(
  WikiDocumentHistorySchema,
) {}
