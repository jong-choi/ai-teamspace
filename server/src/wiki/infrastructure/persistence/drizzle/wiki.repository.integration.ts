import { Test, type TestingModule } from '@nestjs/testing';

import {
  organization,
  user,
} from '#server-source/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseModule } from '#server-source/database/database.module';
import { DatabaseService } from '#server-source/database/database.service';
import { WikiDrizzlePersistenceModule } from '#server-source/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { wikiEntry } from '#server-source/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.schema';
import { WikiRepository } from '#server-source/wiki/infrastructure/persistence/wiki.repository';

import { inArray } from 'drizzle-orm';

const actorUserId = 'wiki-repository-actor';
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
    await database.delete(user).where(inArray(user.id, [actorUserId]));

    await database.insert(user).values({
      id: actorUserId,
      name: '위키 저장소 사용자',
      email: 'wiki-repository-actor@example.com',
      username: 'wikirepositoryactor',
    });
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
    await database.delete(user).where(inArray(user.id, [actorUserId]));
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

  it('rename과 move에서도 동일한 suffix 정책을 쓰고 문서 본문 수정 시 revision을 증가시킨다', async () => {
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
    const updated = expectDefined(
      await repository.updateDocument({
        organizationId: organizationAId,
        documentId: document.id,
        folderId: target.id,
        title: '문서',
        contentMarkdown: '수정',
        actorUserId,
      }),
    );
    expect(updated).toMatchObject({
      folderId: target.id,
      contentMarkdown: '수정',
      revision: 2,
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
    await expect(
      repository.getTreeForOrganization(organizationAId),
    ).resolves.toMatchObject({
      folders: [expect.objectContaining({ id: parent.id })],
    });
  });
});
