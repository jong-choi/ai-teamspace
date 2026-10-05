import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { wikiEntrySelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.zod.js';

import { z } from 'zod';

export const QueryWikiSearchSchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export type QueryWikiSearchInput = z.infer<typeof QueryWikiSearchSchema>;

export const WikiSearchResultItemSchema = z
  .object({
    kind: z.enum(['folder', 'document']),
    id: wikiEntrySelectSchema.shape.id,
    parentFolderId: wikiEntrySelectSchema.shape.parentFolderId,
    name: wikiEntrySelectSchema.shape.name,
    matchedIn: z.array(z.enum(['name', 'content'])).min(1),
  })
  .meta({ id: 'WikiSearchResultItem' });

export const WikiSearchResultSchema = z
  .object({ items: z.array(WikiSearchResultItemSchema) })
  .meta({ id: 'WikiSearchResult' });

export type WikiSearchResultItem = z.infer<typeof WikiSearchResultItemSchema>;
export type WikiSearchResultResponse = z.infer<typeof WikiSearchResultSchema>;

export class QueryWikiSearchDto extends createZodDto(QueryWikiSearchSchema) {}
export class WikiSearchResultDto extends createZodDto(WikiSearchResultSchema) {}
