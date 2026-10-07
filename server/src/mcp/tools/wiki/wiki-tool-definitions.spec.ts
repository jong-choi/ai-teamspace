import { wikiToolDefinitions } from '@/mcp/tools/wiki/wiki-tool-definitions';

describe('Wiki MCP tool 정의', () => {
  it('v1 Wiki tool 네 개를 고정한다', () => {
    expect(
      wikiToolDefinitions.map(({ name, requiredScope }) => ({
        name,
        requiredScope,
      })),
    ).toEqual([
      { name: 'wiki_search', requiredScope: 'wiki:read' },
      { name: 'wiki_document_get', requiredScope: 'wiki:read' },
      { name: 'wiki_document_create', requiredScope: 'wiki:write' },
      { name: 'wiki_document_update', requiredScope: 'wiki:write' },
    ]);
  });

  it('검색어는 기존 200자 상한을 재사용한다', () => {
    const definition = wikiToolDefinitions[0];

    expect(
      definition.inputSchema.parse({
        organizationId: 'org-a',
        q: 'a'.repeat(200),
      }),
    ).toMatchObject({ organizationId: 'org-a' });

    expect(() =>
      definition.inputSchema.parse({
        organizationId: 'org-a',
        q: 'a'.repeat(201),
      }),
    ).toThrow();
  });

  it('update는 기존 최소 한 필드 수정 규칙을 유지한다', () => {
    const definition = wikiToolDefinitions[3];

    expect(() =>
      definition.inputSchema.parse({
        organizationId: 'org-a',
        documentId: 'document-a',
      }),
    ).toThrow();

    expect(
      definition.inputSchema.parse({
        organizationId: 'org-a',
        documentId: 'document-a',
        title: '수정된 제목',
      }),
    ).toMatchObject({
      organizationId: 'org-a',
      documentId: 'document-a',
      title: '수정된 제목',
    });
  });
});
