import {
  mutationToolOutputSchema,
  WikiDocumentMutationReceiptSchema,
} from '@/mcp/contracts/agent-mutation-receipt.dto';
import {
  defineMcpTool,
  readOnlyAnnotations,
  writeAnnotations,
} from '@/mcp/tools/mcp-tool-definition';
import { CreateWikiDocumentSchema } from '@/wiki/dto/create-wiki-document.dto';
import { UpdateWikiDocumentSchema } from '@/wiki/dto/update-wiki-document.dto';
import { WikiDocumentSchema } from '@/wiki/dto/wiki-document.dto';
import {
  QueryWikiSearchSchema,
  WikiSearchResultSchema,
} from '@/wiki/dto/wiki-search.dto';

import { z } from 'zod';

const organizationIdField = {
  organizationId: z.string().trim().min(1),
};

const documentIdentityFields = {
  ...organizationIdField,
  documentId: z.string().trim().min(1),
};

export const wikiSearchTool = defineMcpTool({
  name: 'wiki_search',
  title: '위키 검색',
  description:
    '명시한 조직의 위키 문서 제목과 본문에서 검색어와 글자가 일치하는 문서를 찾습니다. 의미로 찾거나 문서에서 추출한 관계까지 보려면 knowledge_search를 씁니다. wiki:read scope와 호출 시점의 조직 멤버십을 모두 검증합니다.',
  inputSchema: QueryWikiSearchSchema.extend(organizationIdField),
  outputSchema: WikiSearchResultSchema,
  requiredScope: 'wiki:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const wikiDocumentGetTool = defineMcpTool({
  name: 'wiki_document_get',
  title: '위키 문서 조회',
  description:
    '명시한 조직의 위키 문서 하나를 조회합니다. 다른 조직의 documentId는 현재 actor의 조직 접근 검증을 우회할 수 없습니다.',
  inputSchema: z.object(documentIdentityFields),
  outputSchema: WikiDocumentSchema,
  requiredScope: 'wiki:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const wikiDocumentCreateTool = defineMcpTool({
  name: 'wiki_document_create',
  title: '위키 문서 생성',
  description:
    '명시한 조직에 위키 문서를 생성합니다. 기존 Wiki application service의 hierarchy/content validation과 현재 조직 접근 검증을 그대로 적용합니다.',
  inputSchema: CreateWikiDocumentSchema.extend(organizationIdField),
  outputSchema: mutationToolOutputSchema(
    WikiDocumentSchema,
    WikiDocumentMutationReceiptSchema,
  ),
  requiredScope: 'wiki:write',
  classification: 'write',
  annotations: writeAnnotations,
});

export const wikiDocumentUpdateTool = defineMcpTool({
  name: 'wiki_document_update',
  title: '위키 문서 수정',
  description:
    '명시한 조직의 위키 문서 metadata를 수정합니다. 기존 revision/concurrency 및 hierarchy 규칙을 우회하지 않으며 현재 조직 접근 권한이 필요합니다.',
  inputSchema: UpdateWikiDocumentSchema.safeExtend(documentIdentityFields),
  outputSchema: mutationToolOutputSchema(
    WikiDocumentSchema,
    WikiDocumentMutationReceiptSchema,
  ),
  requiredScope: 'wiki:write',
  classification: 'write',
  annotations: writeAnnotations,
});

export const wikiToolDefinitions = [
  wikiSearchTool,
  wikiDocumentGetTool,
  wikiDocumentCreateTool,
  wikiDocumentUpdateTool,
] as const;
