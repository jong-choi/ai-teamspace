import { Outbox } from '@nestjs/outbox';

import { member } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { KnowledgeGraphRateLimitedError } from '@/knowledge-graph/domain/graph-query.error';
import { requestQuota } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/request-quota.schema';
import { SemanticSourceStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-source-state.repository';
import { WikiRefreshAcceptanceRepository } from '@/knowledge-graph/infrastructure/persistence/wiki-refresh-acceptance.repository';
import { SemanticRefreshService } from '@/knowledge-graph/semantic-refresh.service';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import {
  KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
  KNOWLEDGE_GRAPH_SEMANTIC_MANUAL_TOPIC,
} from '@/outbox/outbox-semantic-event.schema';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';

import { jest } from '@jest/globals';
import {
  createRunPrefix,
  KnowledgeGraphHttpFixture,
} from '@test/knowledge-graph/support/knowledge-graph-http.fixture';
import { and, eq } from 'drizzle-orm';

describeKnowledgeGraph(
  'R8-01~05 위키 지식 그래프 갱신 접수 PostgreSQL 통합',
  () => {
    const prefix = createRunPrefix('refresh');
    let fx: KnowledgeGraphHttpFixture;
    let acceptances: WikiRefreshAcceptanceRepository;
    let semantic: SemanticRefreshService;
    let states: SemanticSourceStateRepository;
    let outbox: Outbox;

    beforeAll(async () => {
      process.env.KG_QUOTA_REFRESH_ORG_PER_HOUR = '1';
      fx = await KnowledgeGraphHttpFixture.boot(prefix);
      acceptances = fx.app.get(WikiRefreshAcceptanceRepository, {
        strict: false,
      });
      semantic = fx.app.get(SemanticRefreshService, { strict: false });
      states = fx.app.get(SemanticSourceStateRepository, { strict: false });
      outbox = fx.app.get(Outbox, { strict: false });
    });
    afterEach(() => jest.restoreAllMocks());
    afterAll(async () => {
      await fx.close();
    });

    async function setup(key: string) {
      const owner = await fx.createUser(`${key}-owner`);
      const organizationId = await fx.createOrganization(owner, key);
      const doc = await fx.createWikiDocument(owner, organizationId, {
        title: `${key} 문서`,
        contentMarkdown: '본문',
      });
      return { owner, organizationId, documentId: doc.id };
    }

    function scopeOf(organizationId: string, documentId: string) {
      return {
        organizationId,
        aggregateKind: 'wiki_document' as const,
        aggregateId: documentId,
      };
    }

    async function quotaCounts(organizationId: string) {
      const rows = await fx.database
        .select({ kind: requestQuota.subjectKind, count: requestQuota.count })
        .from(requestQuota)
        .where(eq(requestQuota.organizationId, organizationId));
      return Object.fromEntries(rows.map(({ kind, count }) => [kind, count]));
    }

    function topics(spy: ReturnType<typeof trackOutbox>) {
      return spy.mock.calls.flatMap(([, messages]) =>
        [messages].flat().map(({ topic }) => topic),
      );
    }

    function trackOutbox() {
      return jest.spyOn(outbox, 'add');
    }

    it('R8-01 접수 한 번이 상태·Outbox·quota를 함께 만들고 합친 재요청은 quota를 쓰지 않는다', async () => {
      const { owner, organizationId, documentId } = await setup('r801-ok');
      const added = trackOutbox();

      const first = await acceptances.accept(
        organizationId,
        documentId,
        owner.userId,
      );
      const second = await acceptances.accept(
        organizationId,
        documentId,
        owner.userId,
      );

      expect(first).toMatchObject({ outcome: 'accepted', coalesced: false });
      expect(second).toMatchObject({
        outcome: 'accepted',
        coalesced: true,
        requestId: first.outcome === 'accepted' ? first.requestId : '',
      });
      expect(topics(added)).toEqual([KNOWLEDGE_GRAPH_SEMANTIC_MANUAL_TOPIC]);
      expect(
        (await states.current(scopeOf(organizationId, documentId)))?.state,
      ).toMatchObject({
        manualRequestSeq: 1,
        manualRequestedByUserId: owner.userId,
      });
      expect(await quotaCounts(organizationId)).toEqual({
        organization: 1,
        actor: 1,
      });
    });

    it('R8-01 quota 단계가 실패하면 상태·registry 변경·counter가 모두 되돌아간다', async () => {
      const { owner, organizationId, documentId } =
        await setup('r801-rollback');
      const other = await fx.createWikiDocument(owner, organizationId, {
        title: '두 번째 문서',
      });
      await acceptances.accept(organizationId, documentId, owner.userId);
      const before = await fx.database
        .select()
        .from(outboxAggregateVersion)
        .where(eq(outboxAggregateVersion.aggregateId, other.id));

      await expect(
        acceptances.accept(organizationId, other.id, owner.userId),
      ).rejects.toBeInstanceOf(KnowledgeGraphRateLimitedError);

      expect(
        (await states.current(scopeOf(organizationId, other.id)))?.state,
      ).toBeNull();
      expect(
        await fx.database
          .select()
          .from(outboxAggregateVersion)
          .where(eq(outboxAggregateVersion.aggregateId, other.id)),
      ).toEqual(before);
      expect(await quotaCounts(organizationId)).toEqual({
        organization: 1,
        actor: 1,
      });
    });

    it('R8-02 회원 제거가 먼저 잠그면 접수는 404 의미로 끝나고 아무것도 남기지 않는다', async () => {
      const { owner, organizationId, documentId } = await setup('r802-first');
      const removed = await fx.createUser('r802-first-member');
      await fx.addMember(organizationId, removed.userId, 'member');
      const added = trackOutbox();
      const release = holdMemberRemoval(organizationId, removed.userId);
      await release.locked;

      const accepting = acceptances.accept(
        organizationId,
        documentId,
        removed.userId,
      );
      release.commit();
      await release.done;

      expect(await accepting).toEqual({ outcome: 'not_found' });
      expect(added).not.toHaveBeenCalled();
      expect(
        (await states.current(scopeOf(organizationId, documentId)))?.state,
      ).toBeNull();
      expect(owner.userId).toBeTruthy();
    });

    it('R8-02 접수가 먼저 member를 잠그면 회원 제거는 접수가 끝나기 전에는 진행하지 못한다', async () => {
      const { organizationId, documentId } = await setup('r802-second');
      const removed = await fx.createUser('r802-second-member');
      await fx.addMember(organizationId, removed.userId, 'member');
      const order: string[] = [];
      const original =
        semantic.requestManualRefreshInTransaction.bind(semantic);
      let reached = () => {};
      const atBarrier = new Promise<void>((resolve) => {
        reached = resolve;
      });
      let open = () => {};
      const barrier = new Promise<void>((resolve) => {
        open = resolve;
      });
      jest
        .spyOn(semantic, 'requestManualRefreshInTransaction')
        .mockImplementation(async (...args) => {
          reached();
          await barrier;
          return original(...args);
        });

      const accepting = acceptances
        .accept(organizationId, documentId, removed.userId)
        .then((result) => {
          order.push('accepted');
          return result;
        });
      await atBarrier;
      const removing = fx.database
        .delete(member)
        .where(
          and(
            eq(member.organizationId, organizationId),
            eq(member.userId, removed.userId),
          ),
        )
        .then(() => order.push('removed'));
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(order).toEqual([]);
      open();
      await Promise.all([accepting, removing]);

      expect(order).toHaveLength(2);
      expect(await accepting).toMatchObject({ outcome: 'accepted' });
    });

    it('R8-03 문서 삭제가 먼저면 404, 접수가 먼저면 삭제는 접수가 끝나기 전에는 진행하지 못한다', async () => {
      const first = await setup('r803-first');
      const release = holdDocumentDeletion(first.documentId);
      await release.locked;
      const accepting = acceptances.accept(
        first.organizationId,
        first.documentId,
        first.owner.userId,
      );
      release.commit();
      await release.done;
      expect(await accepting).toEqual({ outcome: 'not_found' });

      const second = await setup('r803-second');
      const order: string[] = [];
      const original =
        semantic.requestManualRefreshInTransaction.bind(semantic);
      let reached = () => {};
      const atBarrier = new Promise<void>((resolve) => {
        reached = resolve;
      });
      let open = () => {};
      const barrier = new Promise<void>((resolve) => {
        open = resolve;
      });
      jest
        .spyOn(semantic, 'requestManualRefreshInTransaction')
        .mockImplementation(async (...args) => {
          reached();
          await barrier;
          return original(...args);
        });
      const accepted = acceptances
        .accept(second.organizationId, second.documentId, second.owner.userId)
        .then((result) => {
          order.push('accepted');
          return result;
        });
      await atBarrier;
      const deleting = fx.database
        .delete(wikiDocument)
        .where(eq(wikiDocument.id, second.documentId))
        .then(() => order.push('deleted'));
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(order).toEqual([]);
      open();
      await Promise.all([accepted, deleting]);
      expect(order).toHaveLength(2);
      expect(await accepted).toMatchObject({ outcome: 'accepted' });
    });

    it('R8-05 registry가 없는 기존 문서는 접수가 registry·수동 요청을 만들고 구조 이벤트 1개만 더한다', async () => {
      const { owner, organizationId, documentId } = await setup('r805');
      await fx.database
        .delete(outboxAggregateVersion)
        .where(eq(outboxAggregateVersion.aggregateId, documentId));
      const added = trackOutbox();

      const accepted = await acceptances.accept(
        organizationId,
        documentId,
        owner.userId,
      );

      expect(accepted).toMatchObject({ outcome: 'accepted', coalesced: false });
      const calls = topics(added);
      expect(calls).toHaveLength(2);
      expect(calls).toContain(KNOWLEDGE_GRAPH_SEMANTIC_MANUAL_TOPIC);
      expect(calls).not.toContain(KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC);
      expect(
        await fx.database
          .select({ desiredSeq: outboxAggregateVersion.desiredSeq })
          .from(outboxAggregateVersion)
          .where(eq(outboxAggregateVersion.aggregateId, documentId)),
      ).toEqual([{ desiredSeq: 1 }]);
    });

    function holdMemberRemoval(organizationId: string, userId: string) {
      return holdTransaction((transaction) =>
        transaction
          .delete(member)
          .where(
            and(
              eq(member.organizationId, organizationId),
              eq(member.userId, userId),
            ),
          ),
      );
    }

    function holdDocumentDeletion(documentId: string) {
      return holdTransaction((transaction) =>
        transaction.delete(wikiDocument).where(eq(wikiDocument.id, documentId)),
      );
    }

    /** 다른 연결의 쓰기 transaction을 commit 신호까지 열어 둔다. */
    function holdTransaction(
      write: (
        transaction: Parameters<
          Parameters<KnowledgeGraphHttpFixture['database']['transaction']>[0]
        >[0],
      ) => PromiseLike<unknown>,
    ) {
      let commit = () => {};
      let locked = () => {};
      const gate = new Promise<void>((resolve) => {
        commit = resolve;
      });
      const held = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const done = fx.database.transaction(async (transaction) => {
        await write(transaction);
        locked();
        await gate;
      });
      return { locked: held, commit, done };
    }
  },
);
