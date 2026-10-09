import { createZodDto } from '@/common/dto/create-zod-dto';
import { GraphCompletenessSchema } from '@/knowledge-graph/domain/graph-completeness';
import { GraphNodeKindSchema } from '@/knowledge-graph/domain/graph-read-contract';

import { z } from 'zod';

export const SearchModeSchema = z.enum(['hybrid', 'semantic', 'keyword']);
export const SearchDegradedReasonSchema = z.enum([
  'graph_unavailable',
  'projection_pending',
  'semantic_disabled',
]);
export const SemanticRecallSchema = z.enum(['exact', 'approximate']);

export const SearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200),
    mode: SearchModeSchema.default('hybrid'),
    limit: z.coerce.number().int().min(1).max(20).default(5),
  })
  .strict();

const searchSourceSchema = z
  .object({
    kind: z.literal('wiki_document'),
    id: z.uuid(),
    nodeId: z.string().min(1).max(512),
    title: z.string(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

const searchSemanticMatchSchema = z
  .object({
    score: z.number().finite(),
    chunkIndex: z.number().int().min(0),
    generationId: z.uuid(),
    indexedSourceUpdatedAt: z.iso.datetime(),
  })
  .strict();

const searchKeywordMatchSchema = z
  .object({
    matchedIn: z.array(z.enum(['title', 'content'])).min(1),
  })
  .strict();

export const SearchResultItemSchema = z
  .object({
    fusedRank: z.number().int().min(1),
    source: searchSourceSchema,
    matchedBy: z.array(z.enum(['semantic', 'keyword'])).min(1),
    semantic: searchSemanticMatchSchema.nullable(),
    keyword: searchKeywordMatchSchema.nullable(),
    excerpt: z.string().max(600).nullable(),
  })
  .strict()
  .meta({ id: 'KnowledgeGraphSearchResultItem' });

export const SearchResponseSchema = z
  .object({
    mode: SearchModeSchema,
    completeness: GraphCompletenessSchema,
    semanticRecall: SemanticRecallSchema.nullable(),
    degradedReasons: z.array(SearchDegradedReasonSchema),
    items: z.array(SearchResultItemSchema),
  })
  .strict()
  .meta({ id: 'KnowledgeGraphSearchResponse' });

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type SearchMode = z.infer<typeof SearchModeSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;
export type SearchDegradedReason = z.infer<typeof SearchDegradedReasonSchema>;
export type SearchAllowedNodeKind = z.infer<typeof GraphNodeKindSchema>;

export class SearchQueryDto extends createZodDto(SearchQuerySchema) {}
export class SearchResponseDto extends createZodDto(SearchResponseSchema) {}
