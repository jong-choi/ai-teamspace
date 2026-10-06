import { createZodDto } from '@/common/dto/create-zod-dto';
import { wikiDocumentSelectSchema } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod';

import { z } from 'zod';

export const QueryWikiSearchSchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export type QueryWikiSearchInput = z.infer<typeof QueryWikiSearchSchema>;

export const WikiSearchResultItemSchema = z
  .object({
    documentId: wikiDocumentSelectSchema.shape.id,
    parentDocumentId: wikiDocumentSelectSchema.shape.parentDocumentId,
    title: wikiDocumentSelectSchema.shape.title,
    matchedIn: z.array(z.enum(['title', 'content'])).min(1),
  })
  .meta({ id: 'WikiSearchResultItem' });

export const WikiSearchResultSchema = z
  .object({ items: z.array(WikiSearchResultItemSchema) })
  .meta({ id: 'WikiSearchResult' });

export type WikiSearchResultResponse = z.infer<typeof WikiSearchResultSchema>;

export class QueryWikiSearchDto extends createZodDto(QueryWikiSearchSchema) {}
export class WikiSearchResultDto extends createZodDto(WikiSearchResultSchema) {}
