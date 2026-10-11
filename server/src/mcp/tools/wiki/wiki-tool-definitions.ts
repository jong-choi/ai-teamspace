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
    '위키 문서 제목과 본문에서 검색어와 글자가 일치하는 문서를 찾습니다. 검색 방식은 고를 수 없습니다. 의미로 찾거나 문서에서 추출한 관계까지 보려면 knowledge_search를 씁니다.',
  inputSchema: QueryWikiSearchSchema.extend({
    ...organizationIdField,
    limit: z.int().min(1).max(20).optional(),
  }),
  outputSchema: WikiSearchResultSchema,
  requiredScope: 'wiki:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const wikiDocumentGetTool = defineMcpTool({
  name: 'wiki_document_get',
  title: '위키 문서 조회',
  description: '위키 문서 하나의 제목과 본문을 조회합니다.',
  inputSchema: z.object(documentIdentityFields),
  outputSchema: WikiDocumentSchema,
  requiredScope: 'wiki:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const wikiDocumentCreateTool = defineMcpTool({
  name: 'wiki_document_create',
  title: '위키 문서 생성',
  description: '위키 문서를 만듭니다.',
  inputSchema: CreateWikiDocumentSchema.extend({
    ...organizationIdField,
    parentDocumentId: CreateWikiDocumentSchema.shape.parentDocumentId.describe(
      '상위 문서 ID. 생략하면 최상위 문서입니다.',
    ),
    position: CreateWikiDocumentSchema.shape.position.describe(
      '같은 상위 문서 아래에서의 순서(0부터).',
    ),
  }),
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
    '위키 문서의 제목, 위치, 본문을 바꿉니다. 바꿀 인자만 넣습니다. 본문은 contentEdit으로 한 구간만 바꿉니다: wiki_document_get으로 읽은 본문에서 바꿀 문구를 oldText에 글자 그대로 넣고, 그 문구가 시작하는 행 번호를 startLine에, 바꿀 내용을 newText에 넣습니다. 문구를 추가할 때는 앞뒤 기존 문구를 oldText로 잡고 newText에 기존 문구와 추가할 문구를 함께 넣습니다. 여러 구간은 한 번에 하나씩 호출합니다. 위치가 모호하면 오류 메시지에 같은 문구가 시작하는 행 번호들이 담겨 옵니다.',
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
