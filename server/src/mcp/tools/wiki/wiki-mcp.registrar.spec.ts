import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { WikiMcpRegistrar } from '@/mcp/tools/wiki/wiki-mcp.registrar';
import type { WikiService } from '@/wiki/wiki.service';

const auth: McpAuthContext = {
  authMethod: 'oauth',
  credentialId: null,
  userId: 'user-a',
  clientId: 'client-a',
  scopes: ['wiki:read', 'wiki:write'],
  allowedOrganizationIds: null,
};

const allow = async () => undefined;
const documentId = '11111111-1111-4111-8111-111111111111';

const document = {
  id: documentId,
  collectionId: '22222222-2222-4222-8222-222222222222',
  organizationId: 'org-a',
  parentDocumentId: null,
  title: '문서',
  position: 0,
  contentMarkdown: '# 문서',
  revision: 1,
  createdByUserId: 'user-a',
  updatedByUserId: 'user-a',
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
};

describe('Wiki MCP registrar', () => {
  const search = jest.fn<
    ReturnType<WikiService['search']>,
    Parameters<WikiService['search']>
  >();
  const getDocument = jest.fn<
    ReturnType<WikiService['getDocument']>,
    Parameters<WikiService['getDocument']>
  >();
  const createDocument = jest.fn<
    ReturnType<WikiService['createDocument']>,
    Parameters<WikiService['createDocument']>
  >();
  const updateDocument = jest.fn<
    ReturnType<WikiService['updateDocument']>,
    Parameters<WikiService['updateDocument']>
  >();

  const registrar = new WikiMcpRegistrar({
    search,
    getDocument,
    createDocument,
    updateDocument,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('검색은 organizationId와 query를 exact service signature로 분리한다', async () => {
    search.mockResolvedValue({ items: [] });

    await registrar
      .tools()[0]!
      .invoke({ organizationId: 'org-a', q: '문서' }, auth, allow);

    expect(search).toHaveBeenCalledWith({ userId: 'user-a' }, 'org-a', {
      q: '문서',
    });
  });

  it('검색의 limit은 service에 넘기지 않고 결과 수만 줄인다', async () => {
    const item = (documentId: string) => ({
      documentId,
      parentDocumentId: null,
      title: '문서',
      matchedIn: ['title' as const],
    });
    search.mockResolvedValue({
      items: [
        item('0199d54e-282e-7adf-8000-0000000000a1'),
        item('0199d54e-282e-7adf-8000-0000000000a2'),
      ],
    });

    const output = await registrar
      .tools()[0]!
      .invoke({ organizationId: 'org-a', q: '문서', limit: 1 }, auth, allow);

    expect(search).toHaveBeenCalledWith({ userId: 'user-a' }, 'org-a', {
      q: '문서',
    });
    expect(output).toMatchObject({
      items: [{ documentId: '0199d54e-282e-7adf-8000-0000000000a1' }],
    });
  });

  it('문서 조회는 actor/organization/document identity를 전달한다', async () => {
    getDocument.mockResolvedValue(document);

    const output = await registrar
      .tools()[1]!
      .invoke({ organizationId: 'org-a', documentId }, auth, allow);

    expect(getDocument).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      documentId,
    );
    expect(output).toMatchObject({ id: documentId, organizationId: 'org-a' });
  });

  it('문서 생성은 organizationId를 body에 섞지 않는다', async () => {
    createDocument.mockResolvedValue(document);

    await registrar.tools()[2]!.invoke(
      {
        organizationId: 'org-a',
        title: '문서',
        contentMarkdown: '# 문서',
      },
      auth,
      allow,
    );

    expect(createDocument).toHaveBeenCalledWith({ userId: 'user-a' }, 'org-a', {
      title: '문서',
      contentMarkdown: '# 문서',
    });
  });

  it('문서 수정은 identity와 DTO body를 분리한다', async () => {
    updateDocument.mockResolvedValue({ ...document, title: '수정됨' });

    await registrar.tools()[3]!.invoke(
      {
        organizationId: 'org-a',
        documentId,
        title: '수정됨',
      },
      auth,
      allow,
    );

    expect(updateDocument).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      documentId,
      { title: '수정됨' },
    );
  });
});
