import { GraphNodeKindSchema } from '@/knowledge-graph/domain/graph-read-contract';
import {
  SearchQuerySchema,
  SearchResponseSchema,
} from '@/knowledge-graph/dto/graph-search.dto';
import { GraphSnapshotSchema } from '@/knowledge-graph/dto/graph-snapshot.dto';
import {
  defineMcpTool,
  readOnlyAnnotations,
} from '@/mcp/tools/mcp-tool-definition';

import { z } from 'zod';

const organizationIdField = {
  organizationId: z.string().trim().min(1),
};

export const knowledgeSearchTool = defineMcpTool({
  name: 'knowledge_search',
  title: '지식 그래프 검색',
  description:
    '명시한 조직의 위키 문서를 의미·키워드로 검색해 현재 원본에서 확인한 출처와 발췌를 반환합니다. wiki:read scope와 호출 시점의 조직 멤버십을 검증하며, 다른 원본 종류는 해당 read scope가 있을 때만 포함합니다.',
  inputSchema: SearchQuerySchema.extend(organizationIdField),
  outputSchema: SearchResponseSchema,
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

export const knowledgeGetContextTool = defineMcpTool({
  name: 'knowledge_get_context',
  title: '지식 그래프 맥락 조회',
  description:
    '지정한 원본 노드에서 최대 2단계까지 현재 권한으로 확인한 관계·출처를 반환합니다.',
  inputSchema: KnowledgeContextInputSchema,
  outputSchema: GraphSnapshotSchema,
  requiredScope: 'wiki:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const knowledgeGraphToolDefinitions = [
  knowledgeSearchTool,
  knowledgeGetContextTool,
] as const;
