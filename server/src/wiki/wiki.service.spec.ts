import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import type { OrganizationsService } from '@/organizations/organizations.service';
import {
  WikiDocumentNotEmptyError,
  WikiDocumentNotFoundError,
} from '@/wiki/domain/wiki.error';
import type { WikiDocument } from '@/wiki/domain/wiki-document';
import { WikiCollaborationInvalidationPublisher } from '@/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider';
import { YjsCollaborationStateAdapter } from '@/wiki/infrastructure/collaboration/yjs/yjs-collaboration-state.adapter';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';
import { WikiService } from '@/wiki/wiki.service';

import { jest } from '@jest/globals';

class FakeWikiRepository extends WikiRepository {
  checkCollaborationReady =
    jest.fn<WikiRepository['checkCollaborationReady']>();
  getTreeForOrganization = jest.fn<WikiRepository['getTreeForOrganization']>();
  findDocumentById = jest.fn<WikiRepository['findDocumentById']>();
  loadCollaborationState = jest.fn<WikiRepository['loadCollaborationState']>();
  createDocument = jest.fn<WikiRepository['createDocument']>();
  updateDocumentMetadata = jest.fn<WikiRepository['updateDocumentMetadata']>();
  deleteDocument = jest.fn<WikiRepository['deleteDocument']>();
  persistCollaborationSnapshot =
    jest.fn<WikiRepository['persistCollaborationSnapshot']>();
  listDocumentRevisions = jest.fn<WikiRepository['listDocumentRevisions']>();
  findDocumentRevision = jest.fn<WikiRepository['findDocumentRevision']>();
  search = jest.fn<WikiRepository['search']>();
}

class FakeWikiCollaborationInvalidationPublisher extends WikiCollaborationInvalidationPublisher {
  publish = jest.fn<WikiCollaborationInvalidationPublisher['publish']>();
}

const organizationId = 'organization-a';
const actorUserId = 'actor-user';
const collectionId = '11111111-1111-4111-8111-111111111111';
const rootDocumentId = '22222222-2222-4222-8222-222222222222';
const childDocumentId = '33333333-3333-4333-8333-333333333333';
const context: OrganizationActorContext = {
  userId: actorUserId,
  activeOrganizationIdCandidate: organizationId,
  providerCredential: {},
};

function document(input: Partial<WikiDocument> = {}): WikiDocument {
  return {
    id: rootDocumentId,
    collectionId,
    organizationId,
    parentDocumentId: null,
    title: '설계 문서',
    position: 0,
    contentMarkdown: '# 설계',
    revision: 1,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    createdAt: new Date('2026-10-05T00:00:00.000Z'),
    updatedAt: new Date('2026-10-05T00:00:00.000Z'),
    ...input,
  };
}

describe('위키 서비스', () => {
  let repository: FakeWikiRepository;
  let organizationsService: Pick<OrganizationsService, 'getDetail'>;
  let collaborationState: YjsCollaborationStateAdapter;
  let invalidationPublisher: FakeWikiCollaborationInvalidationPublisher;
  let service: WikiService;

  beforeEach(() => {
    repository = new FakeWikiRepository();
    organizationsService = {
      getDetail: jest
        .fn<OrganizationsService['getDetail']>()
        .mockResolvedValue({
          organization: {
            id: organizationId,
            name: '조직 A',
            slug: 'organization-a',
            logo: null,
            createdAt: '2026-10-05T00:00:00.000Z',
          },
          role: 'owner',
        }),
    };
    collaborationState = new YjsCollaborationStateAdapter();
    invalidationPublisher = new FakeWikiCollaborationInvalidationPublisher();
    service = new WikiService(
      repository,
      collaborationState,
      invalidationPublisher,
      organizationsService,
    );
  });

  it('문서를 만들 때 Markdown과 동일한 Yjs 상태를 원자적으로 저장한다', async () => {
    repository.createDocument.mockImplementation(
      async (_organizationId, _actorUserId, input) =>
        document({
          parentDocumentId: input.parentDocumentId ?? null,
          title: input.title,
          position: input.position ?? 0,
          contentMarkdown: input.contentMarkdown,
        }),
    );

    await service.createDocument(context, organizationId, {
      title: '공동편집 문서',
      contentMarkdown: '# 안녕하세요',
    });

    const call = repository.createDocument.mock.calls[0];
    const input = call?.[2];
    const collaboration = call?.[3];
    expect(input).toBeDefined();
    expect(collaboration).toBeDefined();
    if (!input || !collaboration) {
      throw new Error('문서 생성 입력이 없습니다.');
    }
    expect(input).toMatchObject({
      title: '공동편집 문서',
      contentMarkdown: '# 안녕하세요',
    });
    expect(call?.[0]).toBe(organizationId);
    expect(call?.[1]).toBe(actorUserId);
    expect(call?.[4]).toBe(1);
    expect(
      collaborationState.decode(collaboration.encodedState).contentMarkdown,
    ).toBe('# 안녕하세요');
  });

  it('문서 목록을 parentDocumentId 기준의 중첩 트리로 반환한다', async () => {
    repository.getTreeForOrganization.mockResolvedValue([
      document({ contentMarkdown: undefined }),
      document({
        id: childDocumentId,
        parentDocumentId: rootDocumentId,
        title: '하위 문서',
        position: 1,
        contentMarkdown: undefined,
      }),
    ]);

    const tree = await service.getTree(context, organizationId);

    expect(tree.documents).toHaveLength(1);
    expect(tree.documents[0]).toMatchObject({
      id: rootDocumentId,
      title: '설계 문서',
    });
    expect(tree.documents[0]?.children).toEqual([
      expect.objectContaining({ id: childDocumentId, title: '하위 문서' }),
    ]);
  });

  it('metadata 수정에서 생략된 부모와 위치는 현재 값을 유지한다', async () => {
    const current = document({
      parentDocumentId: childDocumentId,
      position: 7,
    });
    repository.findDocumentById.mockResolvedValue(current);
    repository.updateDocumentMetadata.mockImplementation(
      async (_organizationId, _documentId, _actorUserId, metadata) =>
        document({
          ...current,
          parentDocumentId: metadata.parentDocumentId,
          title: metadata.title,
          position: metadata.position,
        }),
    );

    await service.updateDocument(context, organizationId, rootDocumentId, {
      title: '수정된 제목',
    });

    expect(repository.updateDocumentMetadata).toHaveBeenCalledWith(
      organizationId,
      rootDocumentId,
      actorUserId,
      {
        parentDocumentId: childDocumentId,
        title: '수정된 제목',
        position: 7,
      },
    );
  });

  it('하위 문서가 있는 문서는 삭제하지 않는다', async () => {
    repository.deleteDocument.mockResolvedValue('not_empty');

    await expect(
      service.deleteDocument(context, organizationId, rootDocumentId),
    ).rejects.toBeInstanceOf(WikiDocumentNotEmptyError);
    expect(invalidationPublisher.publish).not.toHaveBeenCalled();
  });

  it('문서를 삭제하면 열린 공동편집 연결을 끊도록 invalidation을 발행한다', async () => {
    repository.deleteDocument.mockResolvedValue('deleted');

    await service.deleteDocument(context, organizationId, rootDocumentId);

    expect(invalidationPublisher.publish).toHaveBeenCalledWith({
      scope: 'document',
      organizationId,
      documentId: rootDocumentId,
    });
  });

  it('없는 문서를 조회하면 not found 오류를 반환한다', async () => {
    repository.findDocumentById.mockResolvedValue(null);

    await expect(
      service.getDocument(context, organizationId, rootDocumentId),
    ).rejects.toBeInstanceOf(WikiDocumentNotFoundError);
  });

  it('검색 결과는 document 중심 계약을 그대로 반환한다', async () => {
    repository.search.mockResolvedValue([
      {
        documentId: rootDocumentId,
        parentDocumentId: null,
        title: '설계 문서',
        matchedIn: ['title', 'content'],
      },
    ]);

    await expect(
      service.search(context, organizationId, { q: '설계' }),
    ).resolves.toEqual({
      items: [
        {
          documentId: rootDocumentId,
          parentDocumentId: null,
          title: '설계 문서',
          matchedIn: ['title', 'content'],
        },
      ],
    });
  });
});
