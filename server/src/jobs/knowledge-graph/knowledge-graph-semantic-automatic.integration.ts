import { randomUUID } from 'node:crypto';

import { OutboxRelay } from '@nestjs/outbox';

import {
  SEMANTIC_AUTO_JOB,
  SemanticJobDataSchema,
} from '@/jobs/knowledge-graph/knowledge-graph-semantic.job';
import { KnowledgeGraphSemanticOutboxTransport } from '@/jobs/knowledge-graph/knowledge-graph-semantic-outbox.transport';
import { deriveSemanticIndexStatus } from '@/knowledge-graph/domain/semantic-index-status';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { computeSemanticSourceSignature } from '@/knowledge-graph/domain/semantic-source-signature';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';
import { outboxSemanticSourceState } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC } from '@/outbox/outbox-semantic-event.schema';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { eq } from 'drizzle-orm';

jest.setTimeout(60_000);
describeKnowledgeGraph(
  '실제 자동 의미 색인의 quiet·relay 관측·재기동 복구',
  () => {
    const context = createSemanticFlowContext();
    const scope = (id: string) =>
      ({
        organizationId: context.org,
        aggregateKind: 'wiki_document',
        aggregateId: id,
      }) as const;
    async function automaticJob(id: string) {
      const jobs = await context.queue.getJobs([
        'delayed',
        'waiting',
        'active',
      ]);
      return jobs.find((job) => {
        const data = SemanticJobDataSchema.safeParse(job.data);
        return (
          job.name === SEMANTIC_AUTO_JOB &&
          data.success &&
          data.data.aggregateId === id
        );
      });
    }
    async function observed(id: string) {
      await waitForCondition(async () => {
        const current = await context.app
          .get(OutboxSemanticSourceState)
          .current(scope(id));
        return (
          current?.state?.observedSeq === current?.version.desiredSeq &&
          Boolean(await automaticJob(id))
        );
      }, '최신 commit 관측과 자동 작업이 없습니다.');
      const job = await automaticJob(id);
      if (!job) throw new Error('자동 작업이 없습니다.');
      return job;
    }
    async function elapsedQuiet(id: string) {
      // 실제5분 상수를 유지하고 fixture의 source/commit 관측 시각만6분 과거로 둔다.
      const at = new Date(Date.now() - 360_000);
      await context.database
        .update(wikiDocument)
        .set({ updatedAt: at })
        .where(eq(wikiDocument.id, id));
      await context.database
        .update(outboxSemanticSourceState)
        .set({ observedAt: at })
        .where(eq(outboxSemanticSourceState.aggregateId, id));
    }
    it('F7-02·05 연속 네 변경과10개 동시 owner 저장에서도 quiet 전 모델0이고 quiet 후 최신 signature 하나만 활성화한다', async () => {
      await context.queue.pause();
      const created = await context.createWiki(
        '연속 자동 변경',
        '최초 자동 본문',
      );
      for (const minute of [0, 2, 4, 6]) {
        await context.replaceWikiBody(created.id, `${minute}분의 자동 본문`);
        await context.database
          .update(wikiDocument)
          .set({ updatedAt: new Date(Date.now() - (10 - minute) * 60_000) })
          .where(eq(wikiDocument.id, created.id));
      }
      const actors = await Promise.all(
        Array.from({ length: 10 }, () => context.createActor()),
      );
      await Promise.all(
        actors.map((actor, index) =>
          context.wiki.updateDocumentMetadata(context.org, created.id, actor, {
            title: `동시 편집 ${index}`,
            parentDocumentId: null,
            position: index,
          }),
        ),
      );
      const early = await observed(created.id);
      const before = await context.app
        .get(OutboxSemanticSourceState)
        .current(scope(created.id));
      expect(before?.version.desiredSeq).toBe(15);
      expect(context.extractor.calls).toHaveLength(0);
      await context.queue.resume();
      await early.promote();
      await waitForCondition(
        async () => (await early.getState()) === 'completed',
        '이른 자동 작업이 재예약을 끝내지 않았습니다.',
      );
      const delayed = await observed(created.id);
      expect(delayed.delay).toBeGreaterThan(290_000);
      expect(context.extractor.calls).toHaveLength(0);
      await elapsedQuiet(created.id);
      await delayed.promote();
      await context.indexed(created.id, 0);
      const snapshot = await context.wiki.findDocumentById(
        context.org,
        created.id,
      );
      if (!snapshot) throw new Error('최신 owner snapshot이 없습니다.');
      const current = await context.app
        .get(OutboxSemanticSourceState)
        .current(scope(created.id));
      expect(current?.state?.indexedSignature).toBe(
        computeSemanticSourceSignature(snapshot),
      );
      expect(
        context.extractor.calls.filter((text) => text === '6분의 자동 본문'),
      ).toHaveLength(1);
      expect(
        await context.graph.query(
          'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.sourceId=$source RETURN count(DISTINCT c.generationId) AS generations',
          { org: context.org, source: created.id },
        ),
      ).toEqual([{ generations: '1' }]);
    });
    it('F7-03·04 지연 relay는 과거 source 시각으로 quiet를 생략하지 않고 중복·역순 전달은 최초 관측과 due를 유지한다', async () => {
      for (const relay of context.app.get(OutboxRelay, { each: true }))
        await relay.stop();
      await context.queue.pause();
      const created = await context.createWiki(
        '지연 relay',
        '지연 relay 현재 본문',
      );
      await context.wiki.updateDocumentMetadata(
        context.org,
        created.id,
        context.actor,
        { title: 'relay 최신 제목', parentDocumentId: null, position: 1 },
      );
      await context.database
        .update(wikiDocument)
        .set({ updatedAt: new Date(Date.now() - 600_000) })
        .where(eq(wikiDocument.id, created.id));
      const state = context.app.get(OutboxSemanticSourceState);
      expect((await state.current(scope(created.id)))?.state).toBeNull();
      expect(
        context.extractor.calls.filter(
          (text) => text === created.contentMarkdown,
        ),
      ).toHaveLength(0);
      await context.restartJobs();
      await observed(created.id);
      for (const relay of context.app.get(OutboxRelay, { each: true }))
        await relay.stop();
      const first = await observed(created.id);
      const current = await context.app
        .get(OutboxSemanticSourceState)
        .current(scope(created.id));
      expect(first.delay).toBeGreaterThan(290_000);
      const owner = await context.wiki.findDocumentById(
        context.org,
        created.id,
      );
      if (!owner || !current) throw new Error('관측 원본이 없습니다.');
      expect(
        deriveSemanticIndexStatus(
          current,
          owner.updatedAt,
          semanticPipelineFingerprint,
        )?.status,
      ).toBe('waiting');
      const observedAt = current.state?.observedAt;
      // 현재·과거·미래 sequence 재관측은 최초 관측 시각을 수정할 수 없다.
      for (const seq of [2, 0, 3, 2])
        await context.app
          .get(OutboxSemanticSourceState)
          .observeCommitted(scope(created.id), seq);
      for (const sourceVersion of [2, 1, 2])
        await context.app.get(KnowledgeGraphSemanticOutboxTransport).publish(
          {
            id: randomUUID(),
            topic: KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
            payload: {
              ...scope(created.id),
              operation: 'changed',
              sourceVersion,
              occurredAt: created.updatedAt.toISOString(),
            },
            key: JSON.stringify(['wiki_document', context.org, created.id]),
            headers: {},
            createdAt: 0,
            availableAt: 0,
            attempts: 0,
            lastError: null,
          },
          { signal: new AbortController().signal },
        );
      expect(
        (
          await context.app
            .get(OutboxSemanticSourceState)
            .current(scope(created.id))
        )?.state?.observedAt,
      ).toEqual(observedAt);
      const replayed = await observed(created.id);
      if (!observedAt) throw new Error('최초 관측 시각이 없습니다.');
      // queue 재전달의 wall clock 오차와 PG eligibility 불변을 분리한다.
      expect(
        Math.abs(
          replayed.timestamp +
            replayed.delay -
            (observedAt.getTime() + 300_000),
        ),
      ).toBeLessThan(250);
      await context.queue.resume();
      await replayed.promote();
      await waitForCondition(
        async () => (await replayed.getState()) === 'completed',
        'relay 복구의 조기 작업이 끝나지 않았습니다.',
      );
      expect(
        context.extractor.calls.filter(
          (text) => text === created.contentMarkdown,
        ),
      ).toHaveLength(0);
      const afterEarly = await observed(created.id);
      await elapsedQuiet(created.id);
      await afterEarly.promote();
      await context.indexed(created.id, 0);
      expect(
        context.extractor.calls.filter(
          (text) => text === created.contentMarkdown,
        ),
      ).toHaveLength(1);
      // 이 사례가 의도적으로 중단한 relay를 다음 사례에 넘기지 않는다.
      await context.restartJobs();
    });
    it('F7-04·U7-17 같은 ms에 두 본문이 commit돼도 seq는 구분되고 원래 서명 복원은 모델 호출 없이 최신을 만족한다', async () => {
      const originalText = '같은 ms 이전에 활성화한 원래 본문';
      const created = await context.createWiki('같은 ms 복원', originalText);
      await context.refresh.requestManualRefresh(
        context.org,
        created.id,
        context.actor,
      );
      await context.indexed(created.id, 1);
      const state = context.app.get(OutboxSemanticSourceState);
      const before = await state.current(scope(created.id));
      await context.queue.pause();
      jest.useFakeTimers({
        doNotFake: [
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'setImmediate',
          'clearImmediate',
          'nextTick',
          'queueMicrotask',
          'hrtime',
          'performance',
        ],
      });
      jest.setSystemTime(new Date());
      try {
        await context.replaceWikiBody(created.id, '같은 ms 중간의 다른 본문');
        const middle = await context.wiki.findDocumentById(
          context.org,
          created.id,
        );
        await context.replaceWikiBody(created.id, originalText);
        const latest = await context.wiki.findDocumentById(
          context.org,
          created.id,
        );
        expect(latest?.updatedAt).toEqual(middle?.updatedAt);
      } finally {
        jest.useRealTimers();
      }
      const automatic = await observed(created.id);
      expect((await state.current(scope(created.id)))?.version.desiredSeq).toBe(
        3,
      );
      await elapsedQuiet(created.id);
      await context.queue.resume();
      await automatic.promote();
      await context.indexed(created.id, 1);
      const after = await state.current(scope(created.id));
      expect(after?.state?.indexedSeq).toBe(3);
      expect(after?.state?.indexedSignature).toBe(
        before?.state?.indexedSignature,
      );
      expect(after?.state?.activeGenerationId).toBe(
        before?.state?.activeGenerationId,
      );
      expect(
        context.extractor.calls.filter((text) => text === originalText),
      ).toHaveLength(1);
      expect(
        context.extractor.calls.filter(
          (text) => text === '같은 ms 중간의 다른 본문',
        ),
      ).toHaveLength(0);
    });
    it('F7-16·Q7-08 자동 timer가 유실된 뒤 Jobs 재기동은 PG gap에서 실제 quiet가 지난 원본을 복구한다', async () => {
      await context.queue.pause();
      const created = await context.createWiki(
        '자동 재기동 복구',
        '유실 뒤 자동 원본',
      );
      await observed(created.id);
      for (const relay of context.app.get(OutboxRelay, { each: true }))
        await relay.stop();
      await elapsedQuiet(created.id);
      await context.queue.obliterate({ force: true });
      await context.restartJobs();
      await context.queue.resume();
      await context.indexed(created.id, 0);
      const current = await context.app
        .get(OutboxSemanticSourceState)
        .current(scope(created.id));
      expect(current?.state?.indexedSeq).toBe(current?.version.desiredSeq);
      expect(
        context.extractor.calls.filter(
          (text) => text === created.contentMarkdown,
        ),
      ).toHaveLength(1);
    });
  },
);
