import { GraphCompletenessSchema } from '@/knowledge-graph/domain/graph-completeness';
import { GraphNodeKindSchema } from '@/knowledge-graph/domain/graph-read-contract';
import {
  LongExcerptSearchResponseSchema,
  LongExcerptSearchResultItemSchema,
  SearchQuerySchema,
} from '@/knowledge-graph/dto/graph-search.dto';
import { GraphSnapshotSchema } from '@/knowledge-graph/dto/graph-snapshot.dto';
import { KNOWLEDGE_RECORD_KINDS } from '@/mcp/tools/knowledge-graph/knowledge-graph-agent-view';
import {
  defineMcpTool,
  readOnlyAnnotations,
} from '@/mcp/tools/mcp-tool-definition';

import { z } from 'zod';

const organizationIdField = {
  organizationId: z.string().trim().min(1),
};

const relationLineSchema = z.string().max(1200);

const KnowledgeRecordSchema = z
  .object({
    kind: z.enum(KNOWLEDGE_RECORD_KINDS),
    nodeId: z.string().min(1).max(512),
    sourceId: z.string().min(1).max(512).nullable(),
    title: z.string().min(1).max(500),
  })
  .strict();

export const KnowledgeSearchOutputSchema =
  LongExcerptSearchResponseSchema.extend({
    items: z.array(
      LongExcerptSearchResultItemSchema.extend({
        relations: z.array(relationLineSchema),
      }),
    ),
    records: z.array(KnowledgeRecordSchema),
  });

export const knowledgeSearchTool = defineMcpTool({
  name: 'knowledge_search',
  title: '지식 그래프 검색',
  description:
    '명시한 조직의 지식 그래프를 의미·키워드로 검색합니다. items는 위키 문서이며 현재 원본에서 확인한 발췌(excerpt)와 그 문서에서 추출한 관계(relations, "A -[관계]-> B")를 함께 반환합니다. records는 제목이 검색어의 낱말과 일치하는 프로젝트·티켓·회의·멤버이며 해당 read scope가 있을 때만 포함합니다. 문서 전문은 source.id로 wiki_document_get에서, 노드의 주변 관계는 nodeId로 knowledge_get_context에서 읽습니다. 제목·본문의 글자 일치만 필요하면 wiki_search를 씁니다. wiki:read scope와 호출 시점의 조직 멤버십을 검증합니다.',
  inputSchema: SearchQuerySchema.extend(organizationIdField),
  outputSchema: KnowledgeSearchOutputSchema,
  requiredScope: 'wiki:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const KnowledgeContextInputSchema = z
  .object({
    ...organizationIdField,
    focusKind: GraphNodeKindSchema,
    focusId: z.string().min(1).max(512),
    depth: z.coerce.number().int().min(1).max(2).default(1),
  })
  .strict();

export const KnowledgeContextOutputSchema = z
  .object({
    nodes: z.array(
      z
        .object({
          nodeId: z.string().min(1).max(512),
          kind: GraphNodeKindSchema,
          title: z.string().min(1).max(500),
          sourceId: z.string().min(1).max(512).nullable(),
        })
        .strict(),
    ),
    entities: z.array(z.string().min(1).max(500)),
    relations: z.array(relationLineSchema),
    truncated: z.boolean(),
    completeness: GraphCompletenessSchema,
    degradedReasons: GraphSnapshotSchema.shape.degradedReasons,
  })
  .strict();

export const knowledgeGetContextTool = defineMcpTool({
  name: 'knowledge_get_context',
  title: '지식 그래프 맥락 조회',
  description:
    '지정한 노드에서 최대 2단계까지 현재 권한으로 확인한 주변 노드와 관계를 반환합니다. focusId에는 knowledge_search가 돌려준 nodeId를 넣거나, 위키 문서·프로젝트·티켓·회의·멤버라면 원본 ID(source.id, sourceId)를 넣습니다. nodes는 원본이 있는 노드, entities는 문서에서 추출한 개념 이름, relations는 "A -[관계]-> B" 형식의 관계입니다.',
  inputSchema: KnowledgeContextInputSchema,
  outputSchema: KnowledgeContextOutputSchema,
  requiredScope: 'wiki:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const knowledgeGraphToolDefinitions = [
  knowledgeSearchTool,
  knowledgeGetContextTool,
] as const;
