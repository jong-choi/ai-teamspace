import { ConfigModule } from '@nestjs/config';
import { Outbox, OutboxRelay } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC } from '@/outbox/outbox-semantic-event.schema';
import { WikiDrizzlePersistenceModule } from '@/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';
import { WikiProjectionQueryModule } from '@/wiki/wiki-projection-query.module';
import { WikiProjectionQueryService } from '@/wiki/wiki-projection-query.service';

import { eq } from 'drizzle-orm';
import * as Y from 'yjs';

const organizationId = 'knowledge-graph-outbox-integration-org';
const actorId = 'knowledge-graph-outbox-integration-actor';

function snapshot(markdown: string) {
  const document = new Y.Doc();
  document.getText('markdown').insert(0, markdown);
  return {
    encodedState: Y.encodeStateAsUpdate(document),
    contentMarkdown: markdown,
  };
}

describe('위키 원본 변경과 지식 그래프 Outbox 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let wiki: WikiRepository;
  let relay: OutboxRelay;
  let query: WikiProjectionQueryService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        WikiDrizzlePersistenceModule,
        WikiProjectionQueryModule,
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    wiki = moduleRef.get(WikiRepository);
    query = moduleRef.get(WikiProjectionQueryService);
    relay = moduleRef.get(OutboxRelay);
  });

  beforeEach(async () => {
    await database
      .delete(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, organizationId));
    await database
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await database.delete(user).where(eq(user.id, actorId));

    await database.insert(user).values({
      id: actorId,
      name: '그래프 변경 테스트 사용자',
      email: 'knowledge-graph-outbox-actor@example.com',
      username: 'knowledgegraphoutboxactor',
    });
    await database.insert(organization).values({
      id: organizationId,
      name: '그래프 변경 테스트 조직',
      slug: organizationId,
      createdAt: new Date('2026-10-08T00:00:00.000Z'),
    });
  });

  afterAll(async () => {
    if (database) {
      await database
        .delete(outboxAggregateVersion)
        .where(eq(outboxAggregateVersion.organizationId, organizationId));
      await database
        .delete(organization)
        .where(eq(organization.id, organizationId));
      await database.delete(user).where(eq(user.id, actorId));
    }
    await moduleRef?.close();
  });

  it('문서 생성·실제 메타데이터 변경·삭제를 순서 있는 Outbox 이벤트로 기록한다', async () => {
    const initialPending = (await relay.stats()).pending;
    const created = await wiki.createDocument(
      organizationId,
      actorId,
      {
        parentDocumentId: null,
        title: '그래프 테스트',
        position: 0,
        contentMarkdown: '# 그래프',
      },
      snapshot('# 그래프'),
      1,
    );
    const [createdState] = await database
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, organizationId));
    expect(createdState).toMatchObject({
      aggregateKind: 'wiki_document',
      aggregateId: created.id,
      desiredSeq: 1,
      appliedSeq: 0,
      deleted: false,
    });
    expect((await relay.stats()).pending).toBe(initialPending + 2);

    const unchanged = await wiki.updateDocumentMetadata(
      organizationId,
      created.id,
      actorId,
      {
        parentDocumentId: null,
        title: created.title,
        position: created.position,
      },
    );
    expect(unchanged?.updatedAt).toEqual(created.updatedAt);
    const [unchangedState] = await database
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, organizationId));
    expect(unchangedState?.desiredSeq).toBe(1);

    await wiki.updateDocumentMetadata(organizationId, created.id, actorId, {
      parentDocumentId: null,
      title: '그래프 수정',
      position: 0,
    });
    const [modifiedState] = await database
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, organizationId));
    expect(modifiedState?.desiredSeq).toBe(2);

    await wiki.deleteDocument(organizationId, created.id);
    const [deletedState] = await database
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, organizationId));
    expect(deletedState).toMatchObject({ desiredSeq: 3, deleted: true });
    expect((await relay.stats()).pending).toBe(initialPending + 6);
  });

  it('Outbox 추가 실패 때 위키 생성과 변경 버전 저장을 함께 롤백한다', async () => {
    const outbox = moduleRef.get(Outbox);
    const mock = jest
      .spyOn(outbox, 'add')
      .mockRejectedValueOnce(new Error('테스트용 Outbox 저장 실패'));
    try {
      await expect(
        wiki.createDocument(
          organizationId,
          actorId,
          {
            parentDocumentId: null,
            title: '롤백되어야 하는 문서',
            position: 0,
            contentMarkdown: '',
          },
          snapshot(''),
          1,
        ),
      ).rejects.toThrow('테스트용 Outbox 저장 실패');
    } finally {
      mock.mockRestore();
    }

    expect(await wiki.getTreeForOrganization(organizationId)).toHaveLength(0);
    const changed = await database
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, organizationId));
    expect(changed).toHaveLength(0);
  });

  it('본문이 동일한 공동편집 체크포인트에서는 새 의미 변경 이벤트를 만들지 않는다', async () => {
    const created = await wiki.createDocument(
      organizationId,
      actorId,
      {
        parentDocumentId: null,
        title: '체크포인트',
        position: 0,
        contentMarkdown: '',
      },
      snapshot(''),
      1,
    );
    await wiki.persistCollaborationSnapshot(
      organizationId,
      created.id,
      snapshot(''),
      actorId,
      [actorId],
      1,
      true,
    );
    const [state] = await database
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, organizationId));
    expect(state?.desiredSeq).toBe(1);
  });
  it('R7-01 의미 Outbox 저장 실패도 앞선 업무·구조 이벤트·registry를 전부 롤백한다', async () => {
    const outbox = moduleRef.get(Outbox);
    const add = outbox.add.bind(outbox);
    const before = (await relay.stats()).pending;
    const injected = jest
      .spyOn(outbox, 'add')
      .mockImplementationOnce(add)
      .mockRejectedValueOnce(new Error('의미 Outbox 장애 주입'));
    try {
      await expect(
        wiki.createDocument(
          organizationId,
          actorId,
          {
            parentDocumentId: null,
            title: '의미 원자성',
            position: 0,
            contentMarkdown: '',
          },
          snapshot(''),
          1,
        ),
      ).rejects.toThrow('의미 Outbox 장애 주입');
      expect(injected.mock.calls[1]?.[1]).toMatchObject({
        topic: KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
      });
    } finally {
      injected.mockRestore();
    }
    expect(await wiki.getTreeForOrganization(organizationId)).toHaveLength(0);
    expect(
      await database
        .select()
        .from(outboxAggregateVersion)
        .where(eq(outboxAggregateVersion.organizationId, organizationId)),
    ).toHaveLength(0);
    expect((await relay.stats()).pending).toBe(before);
  });
  it('R7-01·02 제목·정렬·본문 변경만 의미 이벤트를 만들고 Yjs 상태만 바뀌면 만들지 않는다', async () => {
    const append = jest.spyOn(moduleRef.get(Outbox), 'add');
    try {
      const initial = snapshot('# 처음');
      const created = await wiki.createDocument(
        organizationId,
        actorId,
        {
          parentDocumentId: null,
          title: '의미 변경',
          position: 0,
          contentMarkdown: '# 처음',
        },
        initial,
        1,
      );
      await wiki.updateDocumentMetadata(organizationId, created.id, actorId, {
        parentDocumentId: null,
        position: 0,
        title: '제목 변경',
      });
      await wiki.updateDocumentMetadata(organizationId, created.id, actorId, {
        parentDocumentId: null,
        title: '제목 변경',
        position: 1,
      });
      const edit = new Y.Doc();
      let changed;
      try {
        Y.applyUpdate(edit, initial.encodedState);
        edit.getText('markdown').delete(0, edit.getText('markdown').length);
        edit.getText('markdown').insert(0, '# 변경');
        changed = await wiki.persistCollaborationSnapshot(
          organizationId,
          created.id,
          {
            encodedState: Y.encodeStateAsUpdate(edit),
            contentMarkdown: '# 변경',
          },
          actorId,
          [actorId],
          1,
          false,
        );
      } finally {
        edit.destroy();
      }
      expect(
        append.mock.calls.filter(
          ([, message]) =>
            'topic' in message &&
            message.topic === KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
        ).length,
      ).toBe(4);
      append.mockClear();
      const before = await query.currentSemantic(organizationId, created.id);
      const stateOnly = new Y.Doc();
      try {
        Y.applyUpdate(stateOnly, changed.encodedState);
        stateOnly.getMap('검증').set('state-only', true);
        await wiki.persistCollaborationSnapshot(
          organizationId,
          created.id,
          {
            encodedState: Y.encodeStateAsUpdate(stateOnly),
            contentMarkdown: changed.contentMarkdown,
          },
          actorId,
          [actorId],
          1,
          false,
        );
      } finally {
        stateOnly.destroy();
      }
      expect(append.mock.calls.length).toBe(0);
      expect(
        (await query.currentSemantic(organizationId, created.id))?.updatedAt,
      ).toEqual(before?.updatedAt);
    } finally {
      append.mockRestore();
    }
  });
  it('공개 투영 조회는 조직에 속한 원본과 cursor만 반환한다', async () => {
    const created = await wiki.createDocument(
      organizationId,
      actorId,
      {
        parentDocumentId: null,
        title: '공개 조회',
        position: 0,
        contentMarkdown: '# 본문',
      },
      snapshot('# 본문'),
      1,
    );
    expect(await query.current(organizationId, created.id)).toMatchObject({
      id: created.id,
      organizationId,
      title: '공개 조회',
    });
    expect(await query.current('다른-조직', created.id)).toBeNull();
    expect(
      await query.currentSemantic(organizationId, created.id),
    ).toMatchObject({
      id: created.id,
      contentMarkdown: '# 본문',
      title: '공개 조회',
    });
    expect(await query.currentSemantic('다른-조직', created.id)).toBeNull();
    expect(await query.listIds(organizationId, null, 1)).toEqual([
      { id: created.id },
    ]);
    expect(await query.listIds(organizationId, created.id, 1)).toEqual([]);
    expect(await query.listIds('다른-조직', null, 1)).toEqual([]);
  });
});
