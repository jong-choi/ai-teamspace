import { Test, type TestingModule } from '@nestjs/testing';

import {
  organization,
  user,
} from '#server-source/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseModule } from '#server-source/database/database.module';
import { DatabaseService } from '#server-source/database/database.service';
import {
  WikiFolderNotFoundError,
  WikiInvalidFolderMoveError,
} from '#server-source/wiki/domain/wiki.error';
import { WikiDrizzlePersistenceModule } from '#server-source/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { wikiDocumentEditLock } from '#server-source/wiki/infrastructure/persistence/drizzle/schema/wiki-document-edit-lock.schema';
import { wikiDocumentRevision } from '#server-source/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.schema';
import { wikiEntry } from '#server-source/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.schema';
import { WikiRepository } from '#server-source/wiki/infrastructure/persistence/wiki.repository';

import { eq, inArray } from 'drizzle-orm';

const actorUserId = 'wiki-repository-actor';
const otherActorUserId = 'wiki-repository-other-actor';
const actorUserIds = [actorUserId, otherActorUserId] as const;
const organizationAId = 'wiki-repository-organization-a';
const organizationBId = 'wiki-repository-organization-b';
const organizationIds = [organizationAId, organizationBId] as const;

function expectDefined<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('테스트에 필요한 위키 저장 결과가 없습니다.');
  }
  return value;
}

describe('위키 Drizzle 저장소 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let repository: WikiRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, WikiDrizzlePersistenceModule],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    repository = moduleRef.get(WikiRepository);
  });

  beforeEach(async () => {
    await database
      .delete(wikiEntry)
      .where(inArray(wikiEntry.organizationId, organizationIds));
    await database
      .delete(organization)
      .where(inArray(organization.id, organizationIds));
    await database.delete(user).where(inArray(user.id, actorUserIds));

    await database.insert(user).values([
      {
        id: actorUserId,
        name: '위키 저장소 사용자',
        email: 'wiki-repository-actor@example.com',
        username: 'wikirepositoryactor',
      },
      {
        id: otherActorUserId,
        name: '위키 저장소 다른 사용자',
        email: 'wiki-repository-other@example.com',
        username: 'wikirepositoryother',
      },
    ]);
    await database.insert(organization).values([
      {
        id: organizationAId,
        name: '위키 조직 A',
        slug: organizationAId,
        createdAt: new Date('2026-10-05T00:00:00.000Z'),
      },
      {
        id: organizationBId,
        name: '위키 조직 B',
        slug: organizationBId,
        createdAt: new Date('2026-10-05T00:00:00.000Z'),
      },
    ]);
  });

  afterAll(async () => {
    await database
      .delete(wikiEntry)
      .where(inArray(wikiEntry.organizationId, organizationIds));
    await database
      .delete(organization)
      .where(inArray(organization.id, organizationIds));
    await database.delete(user).where(inArray(user.id, actorUserIds));
    await moduleRef.close();
  });

  it('중첩 폴더와 문서를 만들고 같은 부모의 폴더·문서 이름을 하나의 suffix 정책으로 할당한다', async () => {
    const root = await repository.createFolder({
      organizationId: organizationAId,
      parentFolderId: null,
      name: '제품',
      position: 0,
      createdByUserId: actorUserId,
    });
    const nested = await repository.createFolder({
      organizationId: organizationAId,
      parentFolderId: root.id,
      name: 'API',
      position: 0,
      createdByUserId: actorUserId,
    });
    const folderWithConflictingName = await repository.createFolder({
      organizationId: organizationAId,
      parentFolderId: nested.id,
      name: '설계 문서',
      position: 0,
      createdByUserId: actorUserId,
    });
    const documentWithConflictingName = await repository.createDocument({
      organizationId: organizationAId,
      folderId: nested.id,
      title: '설계 문서',
      contentMarkdown: '# 설계',
      actorUserId,
    });

    expect(folderWithConflictingName.name).toBe('설계 문서');
    expect(documentWithConflictingName.title).toBe('설계 문서 (01)');

    const tree = await repository.getTreeForOrganization(organizationAId);
    expect(tree.folders.map(({ name }) => name).sort()).toEqual(
      ['제품', 'API', '설계 문서'].sort(),
    );
    expect(tree.documents).toHaveLength(1);
    expect(tree.documents[0]).toMatchObject({
      folderId: nested.id,
      title: '설계 문서 (01)',
      revision: 1,
    });
    await expect(
      repository.listDocumentRevisions(
        organizationAId,
        documentWithConflictingName.id,
      ),
    ).resolves.toHaveLength(1);
  });

  it('동시 동일 이름 생성에서도 DB 제약을 기준으로 서로 다른 이름을 확정한다', async () => {
    const created = await Promise.all([
      repository.createFolder({
        organizationId: organizationAId,
        parentFolderId: null,
        name: '동시 생성',
        position: 0,
        createdByUserId: actorUserId,
      }),
      repository.createDocument({
        organizationId: organizationAId,
        folderId: null,
        title: '동시 생성',
        contentMarkdown: '',
        actorUserId,
      }),
    ]);

    expect(
      created.map((item) => ('name' in item ? item.name : item.title)).sort(),
    ).toEqual(['동시 생성', '동시 생성 (01)']);
  });

  it('rename과 move는 metadata revision을 올리지 않고 content 저장만 revision을 증가시킨다', async () => {
    const source = await repository.createFolder({
      organizationId: organizationAId,
      parentFolderId: null,
      name: '원본',
      position: 0,
      createdByUserId: actorUserId,
    });
    const target = await repository.createFolder({
      organizationId: organizationAId,
      parentFolderId: null,
      name: '대상',
      position: 1,
      createdByUserId: actorUserId,
    });
    await repository.createFolder({
      organizationId: organizationAId,
      parentFolderId: target.id,
      name: '이름',
      position: 0,
      createdByUserId: actorUserId,
    });
    const moving = await repository.createFolder({
      organizationId: organizationAId,
      parentFolderId: source.id,
      name: '이름',
      position: 0,
      createdByUserId: actorUserId,
    });

    const moved = expectDefined(
      await repository.updateFolder({
        organizationId: organizationAId,
        folderId: moving.id,
        parentFolderId: target.id,
        name: moving.name,
        position: moving.position,
      }),
    );
    expect(moved).toMatchObject({
      parentFolderId: target.id,
      name: '이름 (01)',
    });

    const document = await repository.createDocument({
      organizationId: organizationAId,
      folderId: source.id,
      title: '문서',
      contentMarkdown: '초기',
      actorUserId,
    });
    const metadataUpdated = expectDefined(
      await repository.updateDocumentMetadata({
        organizationId: organizationAId,
        documentId: document.id,
        folderId: target.id,
        title: '문서',
        actorUserId,
      }),
    );
    expect(metadataUpdated).toMatchObject({
      folderId: target.id,
      contentMarkdown: '초기',
      revision: 1,
    });

    await repository.acquireEditLock({
      organizationId: organizationAId,
      documentId: document.id,
      actorUserId,
    });
    const saved = await repository.saveDocumentContent({
      organizationId: organizationAId,
      documentId: document.id,
      contentMarkdown: '수정',
      baseRevision: 1,
      actorUserId,
    });
    expect(saved).toMatchObject({
      status: 'saved',
      document: {
        folderId: target.id,
        contentMarkdown: '수정',
        revision: 2,
      },
    });
  });

  it('하위 항목이 있는 폴더 삭제를 거부하고 조직 범위를 격리한다', async () => {
    const parent = await repository.createFolder({
      organizationId: organizationAId,
      parentFolderId: null,
      name: '삭제 대상',
      position: 0,
      createdByUserId: actorUserId,
    });
    await repository.createDocument({
      organizationId: organizationAId,
      folderId: parent.id,
      title: '하위 문서',
      contentMarkdown: '',
      actorUserId,
    });
    const otherOrganizationFolder = await repository.createFolder({
      organizationId: organizationBId,
      parentFolderId: null,
      name: '다른 조직',
      position: 0,
      createdByUserId: actorUserId,
    });

    await expect(
      repository.deleteFolder(organizationAId, parent.id),
    ).resolves.toBe('not_empty');
    await expect(
      repository.findFolderById(organizationAId, otherOrganizationFolder.id),
    ).resolves.toBeNull();
  });

  it('다른 organization의 폴더를 parent로 참조하지 못하게 DB 경계에서 차단한다', async () => {
    const otherOrganizationFolder = await repository.createFolder({
      organizationId: organizationBId,
      parentFolderId: null,
      name: '다른 조직 부모',
      position: 0,
      createdByUserId: actorUserId,
    });

    await expect(
      repository.createFolder({
        organizationId: organizationAId,
        parentFolderId: otherOrganizationFolder.id,
        name: '잘못된 하위 폴더',
        position: 0,
        createdByUserId: actorUserId,
      }),
    ).rejects.toBeInstanceOf(WikiFolderNotFoundError);
    await expect(
      repository.createDocument({
        organizationId: organizationAId,
        folderId: otherOrganizationFolder.id,
        title: '잘못된 하위 문서',
        contentMarkdown: '',
        actorUserId,
      }),
    ).rejects.toBeInstanceOf(WikiFolderNotFoundError);
  });

  it('동시 폴더 이동에서도 cycle이 생기지 않도록 직렬화한다', async () => {
    const folderA = await repository.createFolder({
      organizationId: organizationAId,
      parentFolderId: null,
      name: '폴더 A',
      position: 0,
      createdByUserId: actorUserId,
    });
    const folderB = await repository.createFolder({
      organizationId: organizationAId,
      parentFolderId: null,
      name: '폴더 B',
      position: 1,
      createdByUserId: actorUserId,
    });

    const results = await Promise.allSettled([
      repository.updateFolder({
        organizationId: organizationAId,
        folderId: folderA.id,
        parentFolderId: folderB.id,
        name: folderA.name,
        position: folderA.position,
      }),
      repository.updateFolder({
        organizationId: organizationAId,
        folderId: folderB.id,
        parentFolderId: folderA.id,
        name: folderB.name,
        position: folderB.position,
      }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    const rejected = results.find(({ status }) => status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.any(WikiInvalidFolderMoveError),
    });

    const persistedA = expectDefined(
      await repository.findFolderById(organizationAId, folderA.id),
    );
    const persistedB = expectDefined(
      await repository.findFolderById(organizationAId, folderB.id),
    );
    expect(
      persistedA.parentFolderId === persistedB.id &&
        persistedB.parentFolderId === persistedA.id,
    ).toBe(false);
  });

  it('동시 acquire에서는 한 owner만 확정되고 release 및 stale takeover가 동작한다', async () => {
    const document = await repository.createDocument({
      organizationId: organizationAId,
      folderId: null,
      title: '잠금 문서',
      contentMarkdown: '',
      actorUserId,
    });

    const [actorLock, otherLock] = await Promise.all([
      repository.acquireEditLock({
        organizationId: organizationAId,
        documentId: document.id,
        actorUserId,
      }),
      repository.acquireEditLock({
        organizationId: organizationAId,
        documentId: document.id,
        actorUserId: otherActorUserId,
      }),
    ]);
    const winner = expectDefined(actorLock).lockedByUserId;
    expect(expectDefined(otherLock).lockedByUserId).toBe(winner);
    expect([actorUserId, otherActorUserId]).toContain(winner);

    const loser = winner === actorUserId ? otherActorUserId : actorUserId;
    const loserRelease = await repository.releaseEditLock({
      organizationId: organizationAId,
      documentId: document.id,
      actorUserId: loser,
    });
    expect(expectDefined(loserRelease).lockedByUserId).toBe(winner);

    await expect(
      repository.releaseEditLock({
        organizationId: organizationAId,
        documentId: document.id,
        actorUserId: winner,
      }),
    ).resolves.toBeNull();
    await expect(
      repository.acquireEditLock({
        organizationId: organizationAId,
        documentId: document.id,
        actorUserId: loser,
      }),
    ).resolves.toMatchObject({ lockedByUserId: loser });

    await database
      .update(wikiDocumentEditLock)
      .set({ expiresAt: new Date(0) })
      .where(eq(wikiDocumentEditLock.documentId, document.id));
    await expect(
      repository.acquireEditLock({
        organizationId: organizationAId,
        documentId: document.id,
        actorUserId: winner,
      }),
    ).resolves.toMatchObject({ lockedByUserId: winner });
  });

  it('stale revision은 원본을 덮지 않고 연속 conflict copy와 history를 남긴다', async () => {
    const document = await repository.createDocument({
      organizationId: organizationAId,
      folderId: null,
      title: 'API 설계',
      contentMarkdown: 'revision 1',
      actorUserId,
    });
    await repository.acquireEditLock({
      organizationId: organizationAId,
      documentId: document.id,
      actorUserId,
    });

    const saved = await repository.saveDocumentContent({
      organizationId: organizationAId,
      documentId: document.id,
      contentMarkdown: 'revision 2',
      baseRevision: 1,
      actorUserId,
    });
    expect(saved).toMatchObject({ status: 'saved', document: { revision: 2 } });

    const firstConflict = await repository.saveDocumentContent({
      organizationId: organizationAId,
      documentId: document.id,
      contentMarkdown: 'stale A',
      baseRevision: 1,
      actorUserId,
    });
    const secondConflict = await repository.saveDocumentContent({
      organizationId: organizationAId,
      documentId: document.id,
      contentMarkdown: 'stale B',
      baseRevision: 1,
      actorUserId,
    });
    expect(firstConflict).toMatchObject({
      status: 'conflict_copy_created',
      document: { contentMarkdown: 'revision 2', revision: 2 },
      conflictCopy: { title: 'API 설계 (01)', contentMarkdown: 'stale A' },
    });
    expect(secondConflict).toMatchObject({
      status: 'conflict_copy_created',
      document: { contentMarkdown: 'revision 2', revision: 2 },
      conflictCopy: { title: 'API 설계 (02)', contentMarkdown: 'stale B' },
    });

    await expect(
      repository.findDocumentById(organizationAId, document.id),
    ).resolves.toMatchObject({ contentMarkdown: 'revision 2', revision: 2 });
    await expect(
      repository.listDocumentRevisions(organizationAId, document.id),
    ).resolves.toEqual([
      expect.objectContaining({ revision: 2 }),
      expect.objectContaining({ revision: 1 }),
    ]);
    await expect(
      repository.findDocumentRevision(organizationAId, document.id, 1),
    ).resolves.toMatchObject({ contentMarkdown: 'revision 1' });
  });

  it('Part 1 문서처럼 history row가 없어도 현재 revision을 baseline으로 조회한다', async () => {
    const document = await repository.createDocument({
      organizationId: organizationAId,
      folderId: null,
      title: '기존 문서',
      contentMarkdown: '현재 내용',
      actorUserId,
    });
    await database
      .delete(wikiDocumentRevision)
      .where(eq(wikiDocumentRevision.documentId, document.id));

    await expect(
      repository.listDocumentRevisions(organizationAId, document.id),
    ).resolves.toEqual([
      expect.objectContaining({
        revision: document.revision,
        editorUserId: document.updatedByUserId,
      }),
    ]);
    await expect(
      repository.findDocumentRevision(
        organizationAId,
        document.id,
        document.revision,
      ),
    ).resolves.toMatchObject({
      contentMarkdown: '현재 내용',
      revision: document.revision,
    });
  });

  it('folder name, document title, Markdown를 검색하고 organization을 격리한다', async () => {
    await repository.createFolder({
      organizationId: organizationAId,
      parentFolderId: null,
      name: '제품 전략',
      position: 0,
      createdByUserId: actorUserId,
    });
    await repository.createDocument({
      organizationId: organizationAId,
      folderId: null,
      title: 'OAuth 설계',
      contentMarkdown: '토큰 회전 정책을 기록한다.',
      actorUserId,
    });
    await repository.createDocument({
      organizationId: organizationBId,
      folderId: null,
      title: 'OAuth 다른 조직',
      contentMarkdown: '토큰 회전 비밀 문서',
      actorUserId,
    });

    await expect(repository.search(organizationAId, '전략')).resolves.toEqual([
      expect.objectContaining({ kind: 'folder', name: '제품 전략' }),
    ]);
    await expect(repository.search(organizationAId, 'OAuth')).resolves.toEqual([
      expect.objectContaining({
        kind: 'document',
        name: 'OAuth 설계',
        matchedIn: ['name'],
      }),
    ]);
    await expect(
      repository.search(organizationAId, '토큰 회전'),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: 'document',
        name: 'OAuth 설계',
        matchedIn: ['content'],
      }),
    ]);
  });
});
