import type { OrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import type { OrganizationsService } from '#server/organizations/organizations.service.js';
import {
  WikiDocumentEditLockRequiredError,
  WikiDocumentLockedError,
  WikiDocumentRevisionNotFoundError,
  WikiFolderNotEmptyError,
  WikiFolderNotFoundError,
  WikiInvalidFolderMoveError,
} from '#server/wiki/domain/wiki.error.js';
import type {
  WikiDocument,
  WikiDocumentSummary,
} from '#server/wiki/domain/wiki-document.js';
import type { WikiDocumentRevision } from '#server/wiki/domain/wiki-document-revision.js';
import type { WikiEditLock } from '#server/wiki/domain/wiki-edit-lock.js';
import type { WikiFolder } from '#server/wiki/domain/wiki-folder.js';
import { WikiRepository } from '#server/wiki/infrastructure/persistence/wiki.repository.js';
import { WikiService } from '#server/wiki/wiki.service.js';

import { jest } from '@jest/globals';

class FakeWikiRepository extends WikiRepository {
  getTreeForOrganization = jest.fn<WikiRepository['getTreeForOrganization']>();
  findFolderById = jest.fn<WikiRepository['findFolderById']>();
  createFolder = jest.fn<WikiRepository['createFolder']>();
  updateFolder = jest.fn<WikiRepository['updateFolder']>();
  deleteFolder = jest.fn<WikiRepository['deleteFolder']>();
  findDocumentById = jest.fn<WikiRepository['findDocumentById']>();
  createDocument = jest.fn<WikiRepository['createDocument']>();
  updateDocumentMetadata = jest.fn<WikiRepository['updateDocumentMetadata']>();
  deleteDocument = jest.fn<WikiRepository['deleteDocument']>();
  acquireEditLock = jest.fn<WikiRepository['acquireEditLock']>();
  renewEditLock = jest.fn<WikiRepository['renewEditLock']>();
  releaseEditLock = jest.fn<WikiRepository['releaseEditLock']>();
  saveDocumentContent = jest.fn<WikiRepository['saveDocumentContent']>();
  listDocumentRevisions = jest.fn<WikiRepository['listDocumentRevisions']>();
  findDocumentRevision = jest.fn<WikiRepository['findDocumentRevision']>();
  search = jest.fn<WikiRepository['search']>();
}

class FakeOrganizationsService {
  getDetail = jest.fn<OrganizationsService['getDetail']>();
}

const context: OrganizationActorContext = {
  userId: 'wiki-actor',
  activeOrganizationIdCandidate: 'organization-a',
  providerCredential: {},
};

function folder(
  input: Partial<WikiFolder> & Pick<WikiFolder, 'id' | 'name'>,
): WikiFolder {
  return {
    id: input.id,
    organizationId: input.organizationId ?? 'organization-a',
    parentFolderId: input.parentFolderId ?? null,
    name: input.name,
    position: input.position ?? 0,
    createdByUserId: input.createdByUserId ?? context.userId,
    createdAt: input.createdAt ?? new Date('2026-10-05T00:00:00.000Z'),
    updatedAt: input.updatedAt ?? new Date('2026-10-05T00:00:00.000Z'),
  };
}

function document(
  input: Partial<WikiDocument> & Pick<WikiDocument, 'id' | 'title'>,
): WikiDocument {
  return {
    id: input.id,
    organizationId: input.organizationId ?? 'organization-a',
    folderId: input.folderId ?? null,
    title: input.title,
    contentMarkdown: input.contentMarkdown ?? '# 문서',
    revision: input.revision ?? 1,
    createdByUserId: input.createdByUserId ?? context.userId,
    updatedByUserId: input.updatedByUserId ?? context.userId,
    createdAt: input.createdAt ?? new Date('2026-10-05T00:00:00.000Z'),
    updatedAt: input.updatedAt ?? new Date('2026-10-05T00:00:00.000Z'),
  };
}

function documentSummary(value: WikiDocument): WikiDocumentSummary {
  return {
    id: value.id,
    organizationId: value.organizationId,
    folderId: value.folderId,
    title: value.title,
    revision: value.revision,
    createdByUserId: value.createdByUserId,
    updatedByUserId: value.updatedByUserId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function editLock(input: Partial<WikiEditLock> = {}): WikiEditLock {
  return {
    documentId: input.documentId ?? '22222222-2222-4222-8222-222222222222',
    organizationId: input.organizationId ?? 'organization-a',
    lockedByUserId: input.lockedByUserId ?? context.userId,
    acquiredAt: input.acquiredAt ?? new Date('2026-10-05T00:00:00.000Z'),
    expiresAt: input.expiresAt ?? new Date('2026-10-05T00:01:00.000Z'),
  };
}

function revision(
  input: Partial<WikiDocumentRevision> = {},
): WikiDocumentRevision {
  return {
    documentId: input.documentId ?? '22222222-2222-4222-8222-222222222222',
    organizationId: input.organizationId ?? 'organization-a',
    revision: input.revision ?? 1,
    editorUserId: input.editorUserId ?? context.userId,
    contentMarkdown: input.contentMarkdown ?? '# 문서',
    createdAt: input.createdAt ?? new Date('2026-10-05T00:00:00.000Z'),
  };
}

describe('위키 서비스', () => {
  let repository: FakeWikiRepository;
  let organizations: FakeOrganizationsService;
  let service: WikiService;

  beforeEach(() => {
    repository = new FakeWikiRepository();
    organizations = new FakeOrganizationsService();
    organizations.getDetail.mockResolvedValue({
      organization: {
        id: 'organization-a',
        name: '조직 A',
        slug: 'organization-a',
        logo: null,
        createdAt: new Date(0).toISOString(),
      },
      role: 'member',
    });
    service = new WikiService(repository, organizations);
  });

  it('트리 조회 전에 조직 접근을 확인하고 날짜를 HTTP 계약으로 변환한다', async () => {
    repository.getTreeForOrganization.mockResolvedValue({
      folders: [
        folder({ id: '11111111-1111-4111-8111-111111111111', name: '제품' }),
      ],
      documents: [
        documentSummary(
          document({
            id: '22222222-2222-4222-8222-222222222222',
            title: '개요',
          }),
        ),
      ],
    });

    const result = await service.getTree(context, 'organization-a');

    expect(organizations.getDetail).toHaveBeenCalledWith(
      context,
      'organization-a',
    );
    expect(result.folders[0]?.createdAt).toBe('2026-10-05T00:00:00.000Z');
    expect(result.documents[0]?.title).toBe('개요');
    expect(result.documents[0]).not.toHaveProperty('contentMarkdown');
  });

  it('폴더 생성은 부모 폴더를 같은 조직에서 확인하고 서버가 확정한 이름을 반환한다', async () => {
    const parent = folder({
      id: '11111111-1111-4111-8111-111111111111',
      name: '제품',
    });
    repository.findFolderById.mockResolvedValue(parent);
    repository.createFolder.mockResolvedValue(
      folder({
        id: '22222222-2222-4222-8222-222222222222',
        parentFolderId: parent.id,
        name: '설계 문서 (01)',
      }),
    );

    const result = await service.createFolder(context, 'organization-a', {
      parentFolderId: parent.id,
      name: '설계 문서',
    });

    expect(repository.createFolder).toHaveBeenCalledWith({
      organizationId: 'organization-a',
      parentFolderId: parent.id,
      name: '설계 문서',
      position: 0,
      createdByUserId: context.userId,
    });
    expect(result.name).toBe('설계 문서 (01)');
  });

  it('다른 조직 범위에서 찾을 수 없는 부모 폴더로 문서를 만들지 않는다', async () => {
    repository.findFolderById.mockResolvedValue(null);

    await expect(
      service.createDocument(context, 'organization-a', {
        folderId: '11111111-1111-4111-8111-111111111111',
        title: '문서',
      }),
    ).rejects.toBeInstanceOf(WikiFolderNotFoundError);
    expect(repository.createDocument).not.toHaveBeenCalled();
  });

  it('폴더를 자기 하위 폴더로 이동하지 못하게 한다', async () => {
    const parent = folder({
      id: '11111111-1111-4111-8111-111111111111',
      name: '상위',
    });
    const child = folder({
      id: '22222222-2222-4222-8222-222222222222',
      name: '하위',
      parentFolderId: parent.id,
    });
    repository.findFolderById.mockImplementation(
      async (_organizationId, id) => {
        if (id === parent.id) return parent;
        if (id === child.id) return child;
        return null;
      },
    );

    await expect(
      service.updateFolder(context, 'organization-a', parent.id, {
        parentFolderId: child.id,
      }),
    ).rejects.toBeInstanceOf(WikiInvalidFolderMoveError);
    expect(repository.updateFolder).not.toHaveBeenCalled();
  });

  it('하위 항목이 있는 폴더 삭제 결과를 conflict 오류로 변환한다', async () => {
    repository.deleteFolder.mockResolvedValue('not_empty');

    await expect(
      service.deleteFolder(
        context,
        'organization-a',
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(WikiFolderNotEmptyError);
  });

  it('edit lock 획득 결과에서 현재 actor 소유 여부를 명시한다', async () => {
    const target = document({
      id: '22222222-2222-4222-8222-222222222222',
      title: '문서',
    });
    repository.findDocumentById.mockResolvedValue(target);
    repository.acquireEditLock.mockResolvedValue(editLock());

    await expect(
      service.acquireEditLock(context, 'organization-a', target.id),
    ).resolves.toMatchObject({
      locked: true,
      ownedByActor: true,
      lockedBy: context.userId,
    });
  });

  it('다른 actor의 edit lock은 획득하지 않고 상태를 그대로 전달한다', async () => {
    const target = document({
      id: '22222222-2222-4222-8222-222222222222',
      title: '문서',
    });
    repository.findDocumentById.mockResolvedValue(target);
    repository.acquireEditLock.mockResolvedValue(
      editLock({ lockedByUserId: 'other-user' }),
    );

    await expect(
      service.acquireEditLock(context, 'organization-a', target.id),
    ).resolves.toMatchObject({
      locked: true,
      ownedByActor: false,
      lockedBy: 'other-user',
    });
  });

  it('다른 actor의 lock을 renew하거나 release하지 못하게 한다', async () => {
    const target = document({
      id: '22222222-2222-4222-8222-222222222222',
      title: '문서',
    });
    const otherActorLock = editLock({ lockedByUserId: 'other-user' });
    repository.findDocumentById.mockResolvedValue(target);
    repository.renewEditLock.mockResolvedValue(otherActorLock);
    repository.releaseEditLock.mockResolvedValue(otherActorLock);

    await expect(
      service.renewEditLock(context, 'organization-a', target.id),
    ).rejects.toBeInstanceOf(WikiDocumentLockedError);
    await expect(
      service.releaseEditLock(context, 'organization-a', target.id),
    ).rejects.toBeInstanceOf(WikiDocumentLockedError);
  });

  it('유효한 lock 없이 content 저장을 허용하지 않는다', async () => {
    repository.saveDocumentContent.mockResolvedValue({
      status: 'lock_required',
    });

    await expect(
      service.saveDocumentContent(
        context,
        'organization-a',
        '22222222-2222-4222-8222-222222222222',
        { contentMarkdown: '# 변경', baseRevision: 1 },
      ),
    ).rejects.toBeInstanceOf(WikiDocumentEditLockRequiredError);
  });

  it('다른 actor lock 상태에서 content 저장을 허용하지 않는다', async () => {
    repository.saveDocumentContent.mockResolvedValue({
      status: 'locked_by_other',
    });

    await expect(
      service.saveDocumentContent(
        context,
        'organization-a',
        '22222222-2222-4222-8222-222222222222',
        { contentMarkdown: '# 변경', baseRevision: 1 },
      ),
    ).rejects.toBeInstanceOf(WikiDocumentLockedError);
  });

  it('stale revision 저장은 canonical 문서를 유지하고 conflict copy를 반환한다', async () => {
    const canonical = document({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'API 설계',
      contentMarkdown: '# 최신',
      revision: 3,
    });
    const conflictCopy = document({
      id: '33333333-3333-4333-8333-333333333333',
      title: 'API 설계 (01)',
      contentMarkdown: '# 내 변경',
      revision: 1,
    });
    repository.saveDocumentContent.mockResolvedValue({
      status: 'conflict_copy_created',
      document: canonical,
      conflictCopy,
    });

    await expect(
      service.saveDocumentContent(context, 'organization-a', canonical.id, {
        contentMarkdown: '# 내 변경',
        baseRevision: 2,
      }),
    ).resolves.toMatchObject({
      status: 'conflict-copy-created',
      conflictCopyCreated: true,
      document: { id: canonical.id, revision: 3, contentMarkdown: '# 최신' },
      conflictCopy: {
        id: conflictCopy.id,
        title: 'API 설계 (01)',
        contentMarkdown: '# 내 변경',
      },
    });
  });

  it('history list/detail은 조직 범위 document를 확인하고 snapshot을 직렬화한다', async () => {
    const target = document({
      id: '22222222-2222-4222-8222-222222222222',
      title: '문서',
    });
    const history = revision({ documentId: target.id, revision: 2 });
    repository.findDocumentById.mockResolvedValue(target);
    repository.listDocumentRevisions.mockResolvedValue([
      {
        documentId: history.documentId,
        organizationId: history.organizationId,
        revision: history.revision,
        editorUserId: history.editorUserId,
        createdAt: history.createdAt,
      },
    ]);
    repository.findDocumentRevision.mockResolvedValue(history);

    await expect(
      service.listDocumentHistory(context, 'organization-a', target.id),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          revision: 2,
          createdAt: '2026-10-05T00:00:00.000Z',
        }),
      ],
    });
    await expect(
      service.getDocumentRevision(context, 'organization-a', target.id, 2),
    ).resolves.toMatchObject({
      revision: 2,
      contentMarkdown: '# 문서',
    });
  });

  it('없는 revision은 전용 not-found 오류로 변환한다', async () => {
    const target = document({
      id: '22222222-2222-4222-8222-222222222222',
      title: '문서',
    });
    repository.findDocumentById.mockResolvedValue(target);
    repository.findDocumentRevision.mockResolvedValue(null);

    await expect(
      service.getDocumentRevision(context, 'organization-a', target.id, 99),
    ).rejects.toBeInstanceOf(WikiDocumentRevisionNotFoundError);
  });

  it('검색은 organization access를 확인한 뒤 repository 결과를 반환한다', async () => {
    repository.search.mockResolvedValue([
      {
        kind: 'document',
        id: '22222222-2222-4222-8222-222222222222',
        parentFolderId: null,
        name: 'API 설계',
        matchedIn: ['content'],
      },
    ]);

    await expect(
      service.search(context, 'organization-a', { q: 'oauth' }),
    ).resolves.toEqual({
      items: [expect.objectContaining({ name: 'API 설계' })],
    });
    expect(organizations.getDetail).toHaveBeenCalledWith(
      context,
      'organization-a',
    );
  });
});
