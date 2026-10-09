import { WikiProjectionSourceSchema } from '@/wiki/domain/wiki-projection-source';
import { WikiSemanticSourceSchema } from '@/wiki/domain/wiki-semantic-source';

import { z } from 'zod';

export const WikiGraphSourceSchema = WikiProjectionSourceSchema.pick({
  id: true,
  title: true,
  parentDocumentId: true,
  position: true,
  updatedAt: true,
});
export const WikiSemanticGraphSourceSchema = WikiSemanticSourceSchema;
export const WikiKeywordCandidateSchema = WikiGraphSourceSchema.pick({
  id: true,
  title: true,
  updatedAt: true,
}).extend({
  matchedIn: z.enum(['title', 'content']).array().min(1),
});
export const WikiGraphPageQuerySchema = z
  .object({
    q: z.string().trim().max(200).nullable(),
    after: z.object({ title: z.string(), id: z.uuid() }).strict().nullable(),
    // 공개 page 최대 100개와 다음 cursor 판정용 lookahead 1개를 허용한다.
    limit: z.number().int().min(1).max(101),
  })
  .strict();

export type WikiGraphSource = z.infer<typeof WikiGraphSourceSchema>;
export type WikiSemanticGraphSource = z.infer<
  typeof WikiSemanticGraphSourceSchema
>;
export type WikiKeywordCandidate = z.infer<typeof WikiKeywordCandidateSchema>;
export type WikiGraphPageQuery = z.infer<typeof WikiGraphPageQuerySchema>;
