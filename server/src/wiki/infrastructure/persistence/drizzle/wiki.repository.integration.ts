import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';
import {
  WikiDocumentNotFoundError,
  WikiInvalidDocumentMoveError,
} from '@/wiki/domain/wiki.error';
import type { CreateWikiDocumentInput } from '@/wiki/dto/create-wiki-document.dto';
import { WikiDrizzlePersistenceModule } from '@/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { wikiCollection } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-collection.schema';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';
import { wikiDocumentRevisionCollaborator } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision-collaborator.schema';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';

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

function createDocument(
  repository: WikiRepository,
  organizationId: string,
  actorUserId: string,
  input: CreateWikiDocumentInput,
  encodedState = collaborationState(input.contentMarkdown ?? ''),
) {
  const contentMarkdown = input.contentMarkdown ?? '';
  return repository.createDocument(
    organizationId,
    actorUserId,
    input,
    {
      encodedState,
      contentMarkdown,
    },
    1,
  );
}

describe('위키 Drizzle 저장소 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let repository: WikiRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [databaseConfig],
        }),
        DatabaseModule,
        WikiDrizzlePersistenceModule,
      ],
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
    const root = await createDocument(
      repository,
      organizationAId,
      actorUserId,
      {
        parentDocumentId: null,
        title: '제품',
        position: 0,
        contentMarkdown: '',
      },
    );

    const [first, second] = await Promise.all([
      createDocument(repository, organizationAId, actorUserId, {
        parentDocumentId: root.id,
        title: '설계 문서',
        position: 0,
        contentMarkdown: '# 첫 문서',
      }),
      createDocument(repository, organizationAId, actorUserId, {
        parentDocumentId: root.id,
        title: '설계 문서',
        position: 1,
        contentMarkdown: '# 둘째 문서',
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
    const root = await createDocument(
      repository,
      organizationAId,
      actorUserId,
      {
        parentDocumentId: null,
        title: '상위',
        position: 0,
        contentMarkdown: '',
      },
    );
    const child = await createDocument(
      repository,
      organizationAId,
      actorUserId,
      {
        parentDocumentId: root.id,
        title: '하위',
        position: 0,
        contentMarkdown: '',
      },
    );

    await expect(
      repository.updateDocumentMetadata(organizationAId, root.id, actorUserId, {
        parentDocumentId: child.id,
        title: root.title,
        position: root.position,
      }),
    ).rejects.toBeInstanceOf(WikiInvalidDocumentMoveError);
  });

  it('하위 문서가 있으면 부모 문서를 삭제하지 않는다', async () => {
    const root = await createDocument(
      repository,
      organizationAId,
      actorUserId,
      {
        parentDocumentId: null,
        title: '상위',
        position: 0,
        contentMarkdown: '',
      },
    );
    await createDocument(repository, organizationAId, actorUserId, {
      parentDocumentId: root.id,
      title: '하위',
      position: 0,
      contentMarkdown: '',
    });

    await expect(
      repository.deleteDocument(organizationAId, root.id),
    ).resolves.toBe('not_empty');
  });

  it('다른 조직의 부모는 owner와 복합 FK 양쪽에서 거부한다', async () => {
    const first = await createDocument(
      repository,
      organizationAId,
      actorUserId,
      {
        parentDocumentId: null,
        title: '조직 A',
        position: 0,
        contentMarkdown: '',
      },
    );
    const second = await createDocument(
      repository,
      organizationBId,
      actorUserId,
      {
        parentDocumentId: null,
        title: '조직 B',
        position: 0,
        contentMarkdown: '',
      },
    );
    await expect(
      repository.updateDocumentMetadata(
        organizationAId,
        first.id,
        actorUserId,
        {
          parentDocumentId: second.id,
          title: first.title,
          position: first.position,
        },
      ),
    ).rejects.toBeInstanceOf(WikiDocumentNotFoundError);
    await expect(
      database
        .update(wikiDocument)
        .set({ parentDocumentId: second.id })
        .where(eq(wikiDocument.id, first.id)),
    ).rejects.toMatchObject({
      cause: { code: '23503', constraint: 'wiki_document_parent_scope_fk' },
    });
  });

  it('서로를 부모로 지정하는 동시 이동은 하나만 성공해 간접 cycle을 만들지 않는다', async () => {
    const first = await createDocument(
      repository,
      organizationAId,
      actorUserId,
      {
        parentDocumentId: null,
        title: '첫째',
        position: 0,
        contentMarkdown: '',
      },
    );
    const second = await createDocument(
      repository,
      organizationAId,
      actorUserId,
      {
        parentDocumentId: null,
        title: '둘째',
        position: 1,
        contentMarkdown: '',
      },
    );
    const attempts = await Promise.allSettled([
      repository.updateDocumentMetadata(
        organizationAId,
        first.id,
        actorUserId,
        {
          parentDocumentId: second.id,
          title: first.title,
          position: first.position,
        },
      ),
      repository.updateDocumentMetadata(
        organizationAId,
        second.id,
        actorUserId,
        {
          parentDocumentId: first.id,
          title: second.title,
          position: second.position,
        },
      ),
    ]);
    expect(
      attempts.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = attempts.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(WikiInvalidDocumentMoveError);
    const rows = await database
      .select()
      .from(wikiDocument)
      .where(inArray(wikiDocument.id, [first.id, second.id]));
    expect(rows.filter((row) => row.parentDocumentId === null)).toHaveLength(1);
  });

  it('stale Yjs snapshot을 현재 DB state와 merge해 기존 struct를 잃지 않는다', async () => {
    const initialMarkdown = '# 시작';
    const initialState = collaborationState(initialMarkdown);
    const created = await createDocument(
      repository,
      organizationAId,
      actorUserId,
      {
        parentDocumentId: null,
        title: '공동편집',
        position: 0,
        contentMarkdown: initialMarkdown,
      },
      initialState,
    );

    const clientA = new Y.Doc();
    const clientB = new Y.Doc();
    Y.applyUpdate(clientA, initialState);
    Y.applyUpdate(clientB, initialState);
    clientA.getText('markdown').insert(initialMarkdown.length, ' A');
    clientB.getText('markdown').insert(initialMarkdown.length, ' B');
    const stateA = Y.encodeStateAsUpdate(clientA);
    const stateB = Y.encodeStateAsUpdate(clientB);

    await repository.persistCollaborationSnapshot(
      organizationAId,
      created.id,
      {
        encodedState: stateA,
        contentMarkdown: clientA.getText('markdown').toJSON(),
      },
      actorUserId,
      [actorUserId],
      1,
      false,
    );
    const mergedResult = await repository.persistCollaborationSnapshot(
      organizationAId,
      created.id,
      {
        encodedState: stateB,
        contentMarkdown: clientB.getText('markdown').toJSON(),
      },
      otherActorUserId,
      [actorUserId, otherActorUserId],
      1,
      true,
    );

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
    const created = await createDocument(
      repository,
      organizationAId,
      actorUserId,
      {
        parentDocumentId: null,
        title: '재시도',
        position: 0,
        contentMarkdown: '초기',
      },
    );
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
    const snapshot = {
      encodedState: staleState,
      contentMarkdown: stale.getText('markdown').toJSON(),
    } as const;

    const first = await repository.persistCollaborationSnapshot(
      organizationAId,
      created.id,
      snapshot,
      actorUserId,
      [actorUserId],
      1,
      true,
    );
    const retried = await repository.persistCollaborationSnapshot(
      organizationAId,
      created.id,
      snapshot,
      actorUserId,
      [actorUserId],
      1,
      true,
    );

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
