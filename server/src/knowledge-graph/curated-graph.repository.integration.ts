import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  member,
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import {
  CuratedGraphEdgeDuplicateError,
  CuratedGraphEndpointInvalidError,
  CuratedGraphNodeConnectedError,
  CuratedGraphRevisionConflictError,
  CuratedGraphWriteForbiddenError,
} from '@/knowledge-graph/domain/curated-graph.error';
import { CuratedGraphRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph.repository';
import { CuratedGraphPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/curated-graph-persistence.module';
import { curatedEdge } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-edge.schema';
import { curatedEditAudit } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-edit-audit.schema';
import { curatedNode } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-node.schema';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { projectColumn } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.schema';
import { ticket } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';
import { wikiCollection } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-collection.schema';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';

import { and, eq, inArray } from 'drizzle-orm';

const organizationAId = 'kg-curated-integration-org-a';
const organizationBId = 'kg-curated-integration-org-b';
const actorUserId = 'kg-curated-integration-user';

describeKnowledgeGraph('curated 그래프 PostgreSQL owner 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let repository: CuratedGraphRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        CuratedGraphPersistenceModule,
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    repository = moduleRef.get(CuratedGraphRepository);
  });

  beforeEach(async () => {
    await database
      .delete(outboxAggregateVersion)
      .where(
        inArray(outboxAggregateVersion.organizationId, [
          organizationAId,
          organizationBId,
        ]),
      );
    await database
      .delete(organization)
      .where(inArray(organization.id, [organizationAId, organizationBId]));
    await database.delete(user).where(eq(user.id, actorUserId));

    await database.insert(user).values({
      id: actorUserId,
      name: 'curated 그래프 테스트 사용자',
      email: 'kg-curated-integration@example.com',
      username: 'kgcuratedintegration',
    });
    await database.insert(organization).values([
      {
        id: organizationAId,
        name: 'curated 그래프 조직 A',
        slug: organizationAId,
        createdAt: new Date('2026-10-08T00:00:00.000Z'),
      },
      {
        id: organizationBId,
        name: 'curated 그래프 조직 B',
        slug: organizationBId,
        createdAt: new Date('2026-10-08T00:00:00.000Z'),
      },
    ]);
    await database.insert(member).values([
      {
        id: `${organizationAId}-owner`,
        organizationId: organizationAId,
        userId: actorUserId,
        role: 'owner',
        createdAt: new Date(),
      },
      {
        id: `${organizationBId}-owner`,
        organizationId: organizationBId,
        userId: actorUserId,
        role: 'owner',
        createdAt: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    if (database) {
      await database
        .delete(outboxAggregateVersion)
        .where(
          inArray(outboxAggregateVersion.organizationId, [
            organizationAId,
            organizationBId,
          ]),
        );
      await database
        .delete(organization)
        .where(inArray(organization.id, [organizationAId, organizationBId]));
      await database.delete(user).where(eq(user.id, actorUserId));
    }
    await moduleRef?.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('node create/update는 revision CAS와 감사·Outbox를 같은 원본 흐름에 남긴다', async () => {
    const node = await repository.createNode(organizationAId, actorUserId, {
      kind: 'custom',
      title: '원본',
    });
    expect(node.revision).toBe(1);

    const updated = await repository.updateNode(
      organizationAId,
      node.id,
      actorUserId,
      1,
      { title: '수정됨' },
    );
    expect(updated).toMatchObject({ title: '수정됨', revision: 2 });

    await expect(
      repository.updateNode(organizationAId, node.id, actorUserId, 1, {
        title: 'stale',
      }),
    ).rejects.toBeInstanceOf(CuratedGraphRevisionConflictError);

    const audits = await database
      .select()
      .from(curatedEditAudit)
      .where(eq(curatedEditAudit.targetId, node.id));
    expect(audits.map(({ operation }) => operation)).toEqual([
      'create',
      'update',
    ]);
    expect(audits.every(({ afterDigest }) => afterDigest !== null)).toBe(true);

    const [projection] = await database
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.aggregateId, node.id));
    expect(projection).toMatchObject({
      organizationId: organizationAId,
      aggregateKind: 'curated_node',
      desiredSeq: 2,
      deleted: false,
    });
  });

  it('edge는 같은 조직의 활성 curated node만 연결하고 연결된 node 삭제를 막는다', async () => {
    const source = await repository.createNode(organizationAId, actorUserId, {
      kind: 'custom',
      title: 'source',
    });
    const target = await repository.createNode(organizationAId, actorUserId, {
      kind: 'custom',
      title: 'target',
    });
    const otherOrganizationNode = await repository.createNode(
      organizationBId,
      actorUserId,
      { kind: 'custom', title: 'other' },
    );

    await expect(
      repository.createEdge(organizationAId, actorUserId, {
        sourceNodeId: source.id,
        targetNodeId: otherOrganizationNode.id,
        predicate: 'related_to',
      }),
    ).rejects.toBeInstanceOf(CuratedGraphEndpointInvalidError);

    const edge = await repository.createEdge(organizationAId, actorUserId, {
      sourceNodeId: source.id,
      targetNodeId: target.id,
      predicate: 'related_to',
    });
    await expect(
      repository.deleteNode(
        organizationAId,
        source.id,
        actorUserId,
        source.revision,
      ),
    ).rejects.toBeInstanceOf(CuratedGraphNodeConnectedError);

    const removedEdge = await repository.deleteEdge(
      organizationAId,
      edge.id,
      actorUserId,
      edge.revision,
    );
    expect(removedEdge).toMatchObject({ status: 'deleted', revision: 2 });

    const removedNode = await repository.deleteNode(
      organizationAId,
      source.id,
      actorUserId,
      source.revision,
    );
    expect(removedNode).toMatchObject({ status: 'deleted', revision: 2 });
  });

  it('동일 revision 편집 두 개 중 하나만 감사·Outbox와 함께 저장된다', async () => {
    const node = await repository.createNode(organizationAId, actorUserId, {
      kind: 'concept',
      title: '동시 편집',
    });
    const results = await Promise.allSettled([
      repository.updateNode(organizationAId, node.id, actorUserId, 1, {
        title: '첫 번째',
      }),
      repository.updateNode(organizationAId, node.id, actorUserId, 1, {
        title: '두 번째',
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: expect.any(CuratedGraphRevisionConflictError) });
    expect(
      await database
        .select()
        .from(curatedEditAudit)
        .where(eq(curatedEditAudit.targetId, node.id)),
    ).toHaveLength(2);
    const [tracking] = await database
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.aggregateId, node.id));
    expect(tracking?.desiredSeq).toBe(2);
  });

  it('서로의 활성 종단으로 이동하는 관계 경합은 중복 오류로 거부하고 원본을 보존한다', async () => {
    const nodes = await Promise.all(
      ['하나', '둘', '셋', '넷'].map((title) =>
        repository.createNode(organizationAId, actorUserId, {
          kind: 'custom',
          title,
        }),
      ),
    );
    const [first, second, third, fourth] = nodes;
    if (!first || !second || !third || !fourth)
      throw new Error('관계 fixture가 없습니다.');
    const left = await repository.createEdge(organizationAId, actorUserId, {
      sourceNodeId: first.id,
      targetNodeId: second.id,
      predicate: 'references',
    });
    const right = await repository.createEdge(organizationAId, actorUserId, {
      sourceNodeId: third.id,
      targetNodeId: fourth.id,
      predicate: 'references',
    });
    const results = await Promise.allSettled([
      repository.updateEdge(organizationAId, left.id, actorUserId, 1, {
        sourceNodeId: third.id,
        targetNodeId: fourth.id,
      }),
      repository.updateEdge(organizationAId, right.id, actorUserId, 1, {
        sourceNodeId: first.id,
        targetNodeId: second.id,
      }),
    ]);
    expect(results).toEqual([
      {
        status: 'rejected',
        reason: expect.any(CuratedGraphEdgeDuplicateError),
      },
      {
        status: 'rejected',
        reason: expect.any(CuratedGraphEdgeDuplicateError),
      },
    ]);
    expect(
      await database
        .select({ revision: curatedEdge.revision })
        .from(curatedEdge)
        .where(inArray(curatedEdge.id, [left.id, right.id])),
    ).toEqual([{ revision: 1 }, { revision: 1 }]);
    expect(
      await database
        .select()
        .from(curatedEditAudit)
        .where(inArray(curatedEditAudit.targetId, [left.id, right.id])),
    ).toHaveLength(2);
  });

  it('같은 값과 빈 부분 수정은 revision·감사·Outbox를 늘리지 않는다', async () => {
    const node = await repository.createNode(organizationAId, actorUserId, {
      kind: 'topic',
      title: '  제목  ',
      properties: { a: 1, b: 2 },
    });
    const same = await repository.updateNode(
      organizationAId,
      node.id,
      actorUserId,
      1,
      { title: '제목', properties: { b: 2, a: 1 } },
    );
    expect(same).toEqual(node);
    const other = await repository.createNode(organizationAId, actorUserId, {
      kind: 'reference',
      title: '참조',
    });
    const edge = await repository.createEdge(organizationAId, actorUserId, {
      sourceNodeId: node.id,
      targetNodeId: other.id,
      predicate: 'references',
    });
    expect(
      await repository.updateEdge(organizationAId, edge.id, actorUserId, 1, {}),
    ).toEqual(edge);
    expect(
      await database
        .select()
        .from(curatedEditAudit)
        .where(inArray(curatedEditAudit.targetId, [node.id, edge.id])),
    ).toHaveLength(2);
  });

  it('무방향 관계는 역순을 같은 중복으로 처리하고 삭제 후 새 UUID로 생성한다', async () => {
    const first = await repository.createNode(organizationAId, actorUserId, {
      kind: 'custom',
      title: '첫째',
    });
    const second = await repository.createNode(organizationAId, actorUserId, {
      kind: 'custom',
      title: '둘째',
    });
    const input = {
      sourceNodeId: first.id,
      targetNodeId: second.id,
      predicate: 'related_to',
      directed: false,
    } satisfies Parameters<CuratedGraphRepository['createEdge']>[2];
    const edge = await repository.createEdge(
      organizationAId,
      actorUserId,
      input,
    );
    expect(edge.sourceNodeId < edge.targetNodeId).toBe(true);
    await expect(
      repository.createEdge(organizationAId, actorUserId, {
        ...input,
        sourceNodeId: second.id,
        targetNodeId: first.id,
      }),
    ).rejects.toBeInstanceOf(CuratedGraphEdgeDuplicateError);
    // repository 정규화를 우회한 직접 INSERT도 DB expression unique가 막아야 한다.
    await expect(
      database.insert(curatedEdge).values({
        organizationId: organizationAId,
        sourceNodeId: edge.targetNodeId,
        targetNodeId: edge.sourceNodeId,
        predicate: 'related_to',
        directed: false,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      }),
    ).rejects.toThrow();
    await repository.deleteEdge(organizationAId, edge.id, actorUserId, 1);
    const replacement = await repository.createEdge(
      organizationAId,
      actorUserId,
      input,
    );
    expect(replacement.id).not.toBe(edge.id);
    expect(replacement.revision).toBe(1);
  });

  it('predicate별 self-loop·방향 정책과 존재하지 않는 종단을 거부한다', async () => {
    const node = await repository.createNode(organizationAId, actorUserId, {
      kind: 'technology',
      title: '기술',
    });
    const input = { sourceNodeId: node.id, targetNodeId: node.id };
    await expect(
      repository.createEdge(organizationAId, actorUserId, {
        ...input,
        predicate: 'related_to',
      }),
    ).rejects.toBeInstanceOf(CuratedGraphEndpointInvalidError);
    await expect(
      repository.createEdge(organizationAId, actorUserId, {
        ...input,
        predicate: 'references',
        directed: false,
      }),
    ).rejects.toBeInstanceOf(CuratedGraphEndpointInvalidError);
    const loop = await repository.createEdge(organizationAId, actorUserId, {
      ...input,
      predicate: 'references',
    });
    expect(loop.sourceNodeId).toBe(loop.targetNodeId);
    await expect(
      repository.deleteNode(organizationAId, node.id, actorUserId, 1),
    ).rejects.toMatchObject({ connectedEdgeCount: 1 });
    await expect(
      repository.createEdge(organizationAId, actorUserId, {
        ...input,
        targetNodeId: randomUUID(),
        predicate: 'references',
      }),
    ).rejects.toBeInstanceOf(CuratedGraphEndpointInvalidError);
  });

  it('관계 종단 이동은 새 원본의 조직·삭제·predicate 정책을 다시 검사한다', async () => {
    const source = await repository.createNode(organizationAId, actorUserId, {
      kind: 'concept',
      title: '시작',
    });
    const target = await repository.createNode(organizationAId, actorUserId, {
      kind: 'concept',
      title: '끝',
    });
    const foreign = await repository.createNode(organizationBId, actorUserId, {
      kind: 'concept',
      title: '타 조직',
    });
    const edge = await repository.createEdge(organizationAId, actorUserId, {
      sourceNodeId: source.id,
      targetNodeId: target.id,
      predicate: 'related_to',
    });
    await expect(
      repository.updateEdge(organizationAId, edge.id, actorUserId, 1, {
        targetNodeId: foreign.id,
      }),
    ).rejects.toBeInstanceOf(CuratedGraphEndpointInvalidError);
    const [business] = await database
      .insert(project)
      .values({
        organizationId: organizationAId,
        key: 'REF',
        name: '업무 원본',
        createdByUserId: actorUserId,
      })
      .returning();
    if (!business) throw new Error('Project fixture가 없습니다.');
    await expect(
      repository.updateEdge(organizationAId, edge.id, actorUserId, 1, {
        targetNodeKind: 'project',
        targetNodeId: business.id,
      }),
    ).rejects.toBeInstanceOf(CuratedGraphEndpointInvalidError);
    const moved = await repository.updateEdge(
      organizationAId,
      edge.id,
      actorUserId,
      1,
      {
        predicate: 'references',
        targetNodeKind: 'project',
        targetNodeId: business.id,
      },
    );
    expect(moved).toMatchObject({
      revision: 2,
      targetNodeKind: 'project',
      targetCuratedNodeId: null,
    });
    await repository.deleteNode(organizationAId, target.id, actorUserId, 1);
    await expect(
      repository.updateEdge(organizationAId, edge.id, actorUserId, 2, {
        targetNodeKind: 'curated_node',
        targetNodeId: target.id,
      }),
    ).rejects.toBeInstanceOf(CuratedGraphEndpointInvalidError);
    await database.delete(project).where(eq(project.id, business.id));
    // 업무 삭제는 사용자 참조 때문에 막지 않으며 이후 참조 수정은 존재 검사를 통과하지 못한다.
    await expect(
      repository.updateEdge(organizationAId, edge.id, actorUserId, 2, {
        properties: { note: '없어진 업무' },
      }),
    ).rejects.toBeInstanceOf(CuratedGraphEndpointInvalidError);
    await repository.deleteEdge(organizationAId, edge.id, actorUserId, 2);
  });

  it('Outbox 기록 실패는 node·감사·desiredSeq를 전부 롤백한다', async () => {
    const events = moduleRef.get(OutboxAggregateChangePublisher);
    jest
      .spyOn(events, 'curatedNodeChanged')
      .mockRejectedValueOnce(new Error('의도한 Outbox 실패'));
    await expect(
      repository.createNode(organizationAId, actorUserId, {
        kind: 'custom',
        title: '롤백',
      }),
    ).rejects.toThrow('의도한 Outbox 실패');
    expect(
      await database
        .select()
        .from(curatedNode)
        .where(eq(curatedNode.organizationId, organizationAId)),
    ).toHaveLength(0);
    expect(
      await database
        .select()
        .from(curatedEditAudit)
        .where(eq(curatedEditAudit.organizationId, organizationAId)),
    ).toHaveLength(0);
    expect(
      await database
        .select()
        .from(outboxAggregateVersion)
        .where(eq(outboxAggregateVersion.organizationId, organizationAId)),
    ).toHaveLength(0);
  });

  it('현재 owner/admin만 저장하며 일반 회원·탈퇴·타 조직은 fail closed다', async () => {
    const condition = and(
      eq(member.organizationId, organizationAId),
      eq(member.userId, actorUserId),
    );
    await database.update(member).set({ role: 'member' }).where(condition);
    await expect(
      repository.createNode(organizationAId, actorUserId, {
        kind: 'custom',
        title: '금지',
      }),
    ).rejects.toBeInstanceOf(CuratedGraphWriteForbiddenError);
    await database.update(member).set({ role: 'admin' }).where(condition);
    const node = await repository.createNode(organizationAId, actorUserId, {
      kind: 'custom',
      title: '관리자',
    });
    await database.delete(member).where(condition);
    await expect(
      repository.updateNode(organizationAId, node.id, actorUserId, 1, {
        title: '탈퇴 후',
      }),
    ).rejects.toBeInstanceOf(CuratedGraphWriteForbiddenError);
    await expect(
      repository.deleteNode(organizationAId, node.id, actorUserId, 1),
    ).rejects.toBeInstanceOf(CuratedGraphWriteForbiddenError);
    const [row] = await database
      .select()
      .from(curatedNode)
      .where(eq(curatedNode.id, node.id));
    expect(row?.title).toBe('관리자');
    expect(
      await database
        .select()
        .from(curatedEditAudit)
        .where(eq(curatedEditAudit.targetId, node.id)),
    ).toMatchObject([{ actorUserId, targetRevision: 1 }]);
  });

  it('종단 삭제와 관계 생성이 경합해도 삭제된 curated node에 활성 관계를 저장하지 않는다', async () => {
    const source = await repository.createNode(organizationAId, actorUserId, {
      kind: 'custom',
      title: '삭제 경합',
    });
    const target = await repository.createNode(organizationAId, actorUserId, {
      kind: 'custom',
      title: '대상',
    });
    const results = await Promise.allSettled([
      repository.deleteNode(organizationAId, source.id, actorUserId, 1),
      repository.createEdge(organizationAId, actorUserId, {
        sourceNodeId: source.id,
        targetNodeId: target.id,
        predicate: 'related_to',
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const [node] = await database
      .select()
      .from(curatedNode)
      .where(eq(curatedNode.id, source.id));
    const edges = await database
      .select()
      .from(curatedEdge)
      .where(eq(curatedEdge.organizationId, organizationAId));
    expect(node).toBeDefined();
    if (node?.deletedAt) {
      expect(edges).toHaveLength(0);
    } else {
      expect(edges).toHaveLength(1);
    }
  });

  it('저장 중 권한 잠금은 demotion을 commit 뒤까지 기다리게 한다', async () => {
    let entered = () => {};
    let release = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const events = moduleRef.get(OutboxAggregateChangePublisher);
    const original = events.curatedNodeChanged.bind(events);
    jest
      .spyOn(events, 'curatedNodeChanged')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        entered();
        await gate;
      });
    const saving = repository.createNode(organizationAId, actorUserId, {
      kind: 'custom',
      title: '권한 잠금',
    });
    await started;
    const demotion = database
      .update(member)
      .set({ role: 'member' })
      .where(
        and(
          eq(member.organizationId, organizationAId),
          eq(member.userId, actorUserId),
        ),
      )
      .then(() => '변경 완료');
    try {
      const result = await Promise.race([
        demotion,
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('잠금 대기'), 50),
        ),
      ]);
      expect(result).toBe('잠금 대기');
    } finally {
      release();
    }
    const node = await saving;
    await demotion;
    await expect(
      repository.updateNode(organizationAId, node.id, actorUserId, 1, {
        title: '권한 상실',
      }),
    ).rejects.toBeInstanceOf(CuratedGraphWriteForbiddenError);
  });

  it('Wiki·Project·Ticket·Meeting 공개 owner capability는 같은 조직의 현재 종단만 허용한다', async () => {
    const [business] = await database
      .insert(project)
      .values({
        organizationId: organizationAId,
        key: 'ALL',
        name: '업무 원본',
        createdByUserId: actorUserId,
      })
      .returning();
    if (!business) throw new Error('Project fixture가 없습니다.');
    const [column] = await database
      .insert(projectColumn)
      .values({ projectId: business.id, name: '업무 열', position: 0 })
      .returning();
    if (!column) throw new Error('Column fixture가 없습니다.');
    const [item] = await database
      .insert(ticket)
      .values({
        organizationId: organizationAId,
        projectId: business.id,
        columnId: column.id,
        number: 1,
        title: '업무 티켓',
        reporterUserId: actorUserId,
        position: 0,
      })
      .returning();
    const [event] = await database
      .insert(meeting)
      .values({
        organizationId: organizationAId,
        organizerUserId: actorUserId,
        title: '업무 회의',
        category: 'team',
        startAt: new Date('2026-10-09T01:00:00Z'),
        endAt: new Date('2026-10-09T02:00:00Z'),
        timeZone: 'Asia/Seoul',
        locationType: 'online',
      })
      .returning();
    const [collection] = await database
      .insert(wikiCollection)
      .values({ organizationId: organizationAId })
      .returning();
    if (!item || !event || !collection)
      throw new Error('업무 fixture가 없습니다.');
    const [document] = await database
      .insert(wikiDocument)
      .values({
        organizationId: organizationAId,
        collectionId: collection.id,
        title: '업무 문서',
        collaborationState: new Uint8Array(),
        collaborationPersistedAt: new Date(),
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      })
      .returning();
    if (!document) throw new Error('Wiki fixture가 없습니다.');
    const source = await repository.createNode(organizationAId, actorUserId, {
      kind: 'reference',
      title: '참조 노드',
    });
    const endpoints = [
      { kind: 'project', id: business.id },
      { kind: 'ticket', id: item.id },
      { kind: 'meeting', id: event.id },
      { kind: 'wiki_document', id: document.id },
    ] satisfies {
      kind: Parameters<
        CuratedGraphRepository['createEdge']
      >[2]['targetNodeKind'];
      id: string;
    }[];
    for (const endpoint of endpoints) {
      const edge = await repository.createEdge(organizationAId, actorUserId, {
        sourceNodeId: source.id,
        targetNodeId: endpoint.id,
        targetNodeKind: endpoint.kind,
        predicate: 'references',
      });
      expect(edge.targetCuratedNodeId).toBeNull();
      await expect(
        repository.createEdge(organizationBId, actorUserId, {
          sourceNodeId: endpoint.id,
          sourceNodeKind: endpoint.kind,
          targetNodeId: endpoint.id,
          targetNodeKind: endpoint.kind,
          predicate: 'references',
        }),
      ).rejects.toBeInstanceOf(CuratedGraphEndpointInvalidError);
    }
    await expect(
      repository.updateNode(organizationAId, business.id, actorUserId, 1, {
        title: 'generic 업무 덮어쓰기',
      }),
    ).resolves.toBeNull();
    await expect(
      repository.deleteNode(organizationAId, document.id, actorUserId, 1),
    ).resolves.toBeNull();
    expect(
      await database
        .select({ name: project.name })
        .from(project)
        .where(eq(project.id, business.id)),
    ).toEqual([{ name: '업무 원본' }]);
    expect(
      await database
        .select()
        .from(curatedEditAudit)
        .where(
          inArray(
            curatedEditAudit.targetId,
            endpoints.map(({ id }) => id),
          ),
        ),
    ).toHaveLength(0);
    await expect(
      repository.deleteNode(organizationAId, source.id, actorUserId, 1),
    ).rejects.toMatchObject({ connectedEdgeCount: 4 });
  });

  it('업무 종단 잠금은 저장 도중 owner 삭제를 기다리게 하고 일반 업무 삭제를 영구 차단하지 않는다', async () => {
    const source = await repository.createNode(organizationAId, actorUserId, {
      kind: 'reference',
      title: '참조 노드',
    });
    const [business] = await database
      .insert(project)
      .values({
        organizationId: organizationAId,
        key: 'LOCK',
        name: '업무 삭제 경합',
        createdByUserId: actorUserId,
      })
      .returning();
    if (!business) throw new Error('Project fixture가 없습니다.');
    let entered = () => {};
    let release = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const events = moduleRef.get(OutboxAggregateChangePublisher);
    const original = events.curatedEdgeChanged.bind(events);
    jest
      .spyOn(events, 'curatedEdgeChanged')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        entered();
        await gate;
      });
    const saving = repository.createEdge(organizationAId, actorUserId, {
      sourceNodeId: source.id,
      targetNodeKind: 'project',
      targetNodeId: business.id,
      predicate: 'references',
    });
    await started;
    const removal = database
      .delete(project)
      .where(eq(project.id, business.id))
      .then(() => '삭제 완료');
    try {
      expect(
        await Promise.race([
          removal,
          new Promise<string>((resolve) =>
            setTimeout(() => resolve('잠금 대기'), 50),
          ),
        ]),
      ).toBe('잠금 대기');
    } finally {
      release();
    }
    const edge = await saving;
    await removal;
    expect(
      await database
        .select()
        .from(curatedEdge)
        .where(eq(curatedEdge.id, edge.id)),
    ).toHaveLength(1);
    await expect(
      repository.updateEdge(organizationAId, edge.id, actorUserId, 1, {
        properties: { note: '삭제 뒤' },
      }),
    ).rejects.toBeInstanceOf(CuratedGraphEndpointInvalidError);
  });
});
