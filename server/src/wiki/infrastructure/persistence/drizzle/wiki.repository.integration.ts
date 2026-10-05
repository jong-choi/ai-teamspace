import { Test, type TestingModule } from '@nestjs/testing';

import {
  organization,
  user,
} from '#server-source/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseModule } from '#server-source/database/database.module';
import { DatabaseService } from '#server-source/database/database.service';
import { WikiInvalidDocumentMoveError } from '#server-source/wiki/domain/wiki.error';
import { WikiDrizzlePersistenceModule } from '#server-source/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { wikiCollection } from '#server-source/wiki/infrastructure/persistence/drizzle/schema/wiki-collection.schema';
import { wikiDocumentRevisionCollaborator } from '#server-source/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision-collaborator.schema';
import { WikiRepository } from '#server-source/wiki/infrastructure/persistence/wiki.repository';

import { and, eq, inArray } from 'drizzle-orm';
import * as Y from 'yjs';

const actorUserId = 'wiki-repository-actor';
const otherActorUserId = 'wiki-repository-other-actor';
const actorUserIds = [actorUserId, otherActorUserId] as const;
const organizationAId = 'wiki-repository-organization-a';
const organizationBId = 'wiki-repository-organization-b';
const organizationIds = [organizationAId, organizationBId] as const;

function collaborationState(markdown: string): Uint8Array {
  const document = new Y.Doc();
  document.getText('markdown').insert(0, markdown);
  return Y.encodeStateAsUpdate(document);
}

function markdownFromState(state: Uint8Array): string {
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  return document.getText('markdown').toJSON();
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
      .delete(organization)
      .where(inArray(organization.id, organizationIds));
    await database.delete(user).where(inArray(user.id, actorUserIds));
    await moduleRef.close();
  });

  it('organization당 collection 하나에서 중첩 문서를 만들고 sibling 제목을 직렬화한다', async () => {
    const root = await repository.createDocument({
      organizationId: organizationAId,
      parentDocumentId: null,
      title: '제품',
      position: 0,
      contentMarkdown: '',
      collaborationState: collaborationState(''),
      collaborationSchemaVersion: 1,
      actorUserId,
    });

    const [first, second] = await Promise.all([
      repository.createDocument({
        organizationId: organizationAId,
        parentDocumentId: root.id,
        title: '설계 문서',
        position: 0,
        contentMarkdown: '# 첫 문서',
        collaborationState: collaborationState('# 첫 문서'),
        collaborationSchemaVersion: 1,
        actorUserId,
      }),
      repository.createDocument({
        organizationId: organizationAId,
        parentDocumentId: root.id,
        title: '설계 문서',
        position: 1,
        contentMarkdown: '# 둘째 문서',
        collaborationState: collaborationState('# 둘째 문서'),
        collaborationSchemaVersion: 1,
        actorUserId,
      }),
    ]);

    expect(new Set([first.title, second.title])).toEqual(
      new Set(['설계 문서', '설계 문서 (01)']),
    );
    const collections = await database
      .select()
      .from(wikiCollection)
      .where(eq(wikiCollection.organizationId, organizationAId));
    expect(collections).toHaveLength(1);

    const tree = await repository.getTreeForOrganization(organizationAId);
    expect(tree.map(({ id }) => id)).toEqual(
      expect.arrayContaining([root.id, first.id, second.id]),
    );
  });

  it('문서를 자기 하위 문서로 이동해 cycle을 만들지 못하게 한다', async () => {
    const root = await repository.createDocument({
      organizationId: organizationAId,
      parentDocumentId: null,
      title: '상위',
      position: 0,
      contentMarkdown: '',
      collaborationState: collaborationState(''),
      collaborationSchemaVersion: 1,
      actorUserId,
    });
    const child = await repository.createDocument({
      organizationId: organizationAId,
      parentDocumentId: root.id,
      title: '하위',
      position: 0,
      contentMarkdown: '',
      collaborationState: collaborationState(''),
      collaborationSchemaVersion: 1,
      actorUserId,
    });

    await expect(
      repository.updateDocumentMetadata({
        organizationId: organizationAId,
        documentId: root.id,
        parentDocumentId: child.id,
        title: root.title,
        position: root.position,
        actorUserId,
      }),
    ).rejects.toBeInstanceOf(WikiInvalidDocumentMoveError);
  });

  it('하위 문서가 있으면 부모 문서를 삭제하지 않는다', async () => {
    const root = await repository.createDocument({
      organizationId: organizationAId,
      parentDocumentId: null,
      title: '상위',
      position: 0,
      contentMarkdown: '',
      collaborationState: collaborationState(''),
      collaborationSchemaVersion: 1,
      actorUserId,
    });
    await repository.createDocument({
      organizationId: organizationAId,
      parentDocumentId: root.id,
      title: '하위',
      position: 0,
      contentMarkdown: '',
      collaborationState: collaborationState(''),
      collaborationSchemaVersion: 1,
      actorUserId,
    });

    await expect(
      repository.deleteDocument(organizationAId, root.id),
    ).resolves.toBe('not_empty');
  });

  it('stale Yjs snapshot을 현재 DB state와 merge해 기존 struct를 잃지 않는다', async () => {
    const initialMarkdown = '# 시작';
    const initialState = collaborationState(initialMarkdown);
    const created = await repository.createDocument({
      organizationId: organizationAId,
      parentDocumentId: null,
      title: '공동편집',
      position: 0,
      contentMarkdown: initialMarkdown,
      collaborationState: initialState,
      collaborationSchemaVersion: 1,
      actorUserId,
    });

    const clientA = new Y.Doc();
    const clientB = new Y.Doc();
    Y.applyUpdate(clientA, initialState);
    Y.applyUpdate(clientB, initialState);
    clientA.getText('markdown').insert(initialMarkdown.length, ' A');
    clientB.getText('markdown').insert(initialMarkdown.length, ' B');
    const stateA = Y.encodeStateAsUpdate(clientA);
    const stateB = Y.encodeStateAsUpdate(clientB);

    await repository.persistCollaborationSnapshot({
      organizationId: organizationAId,
      documentId: created.id,
      encodedState: stateA,
      contentMarkdown: clientA.getText('markdown').toJSON(),
      lastEditorUserId: actorUserId,
      collaboratorUserIds: [actorUserId],
      schemaVersion: 1,
      createCheckpoint: false,
    });
    const mergedResult = await repository.persistCollaborationSnapshot({
      organizationId: organizationAId,
      documentId: created.id,
      encodedState: stateB,
      contentMarkdown: clientB.getText('markdown').toJSON(),
      lastEditorUserId: otherActorUserId,
      collaboratorUserIds: [actorUserId, otherActorUserId],
      schemaVersion: 1,
      createCheckpoint: true,
    });

    const expected = new Y.Doc();
    Y.applyUpdate(expected, stateA);
    Y.applyUpdate(expected, stateB);
    const expectedMarkdown = expected.getText('markdown').toJSON();
    expect(mergedResult.contentMarkdown).toBe(expectedMarkdown);
    expect(markdownFromState(mergedResult.encodedState)).toBe(expectedMarkdown);
    expect(mergedResult.revision).toBe(2);
    expect(mergedResult.checkpointCreated).toBe(true);

    const persisted = await repository.loadCollaborationState(
      organizationAId,
      created.id,
    );
    expect(persisted).not.toBeNull();
    expect(persisted?.contentMarkdown).toBe(expectedMarkdown);
    if (persisted) {
      expect(markdownFromState(persisted.collaborationState)).toBe(
        expectedMarkdown,
      );
    }

    const collaborators = await database
      .select()
      .from(wikiDocumentRevisionCollaborator)
      .where(
        and(
          eq(wikiDocumentRevisionCollaborator.documentId, created.id),
          eq(wikiDocumentRevisionCollaborator.revision, 2),
        ),
      )
      .orderBy(wikiDocumentRevisionCollaborator.ordinal);
    expect(collaborators.map(({ userId }) => userId)).toEqual([
      actorUserId,
      otherActorUserId,
    ]);

    const history = await repository.listDocumentRevisions(
      organizationAId,
      created.id,
    );
    expect(history[0]).toMatchObject({
      revision: 2,
      collaboratorUserIds: [actorUserId, otherActorUserId],
    });
    const revision = await repository.findDocumentRevision(
      organizationAId,
      created.id,
      2,
    );
    expect(revision?.collaboratorUserIds).toEqual([
      actorUserId,
      otherActorUserId,
    ]);
  });

  it('같은 stale snapshot 재시도는 이미 merge된 Yjs state를 되돌리지 않는다', async () => {
    const created = await repository.createDocument({
      organizationId: organizationAId,
      parentDocumentId: null,
      title: '재시도',
      position: 0,
      contentMarkdown: '초기',
      collaborationState: collaborationState('초기'),
      collaborationSchemaVersion: 1,
      actorUserId,
    });
    const base = await repository.loadCollaborationState(
      organizationAId,
      created.id,
    );
    if (!base) {
      throw new Error('테스트 문서 Yjs 상태가 없습니다.');
    }
    const stale = new Y.Doc();
    Y.applyUpdate(stale, base.collaborationState);
    stale.getText('markdown').insert(2, ' 변경');
    const staleState = Y.encodeStateAsUpdate(stale);
    const input = {
      organizationId: organizationAId,
      documentId: created.id,
      encodedState: staleState,
      contentMarkdown: stale.getText('markdown').toJSON(),
      lastEditorUserId: actorUserId,
      collaboratorUserIds: [actorUserId],
      schemaVersion: 1,
      createCheckpoint: true,
    } as const;

    const first = await repository.persistCollaborationSnapshot(input);
    const retried = await repository.persistCollaborationSnapshot(input);

    expect(first).toMatchObject({
      changed: true,
      checkpointCreated: true,
      revision: 2,
    });
    expect(retried).toMatchObject({
      changed: false,
      checkpointCreated: false,
      revision: 2,
      contentMarkdown: '초기 변경',
    });
    await expect(
      repository.listDocumentRevisions(organizationAId, created.id),
    ).resolves.toHaveLength(2);
  });
});
