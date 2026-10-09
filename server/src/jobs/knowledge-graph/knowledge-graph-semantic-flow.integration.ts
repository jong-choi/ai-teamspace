import {
  SEMANTIC_AUTO_JOB,
  SemanticJobDataSchema,
} from '@/jobs/knowledge-graph/knowledge-graph-semantic.job';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';
import { outboxSemanticSourceState } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { eq } from 'drizzle-orm';
import * as Y from 'yjs';

jest.setTimeout(60_000);

describeKnowledgeGraph(
  '실제 Jobs의 Wiki 수동 의미 색인·force·PG active 전환',
  () => {
    const context = createSemanticFlowContext();
    it('F7-07 자동 quiet 대기 중 수동은 실제 Jobs에서 즉시 추출·embedding·Neo4j 활성화하고 같은 서명 force도 다시 실행한다', async () => {
      const doc = new Y.Doc();
      let created;
      try {
        doc.getText('markdown').insert(0, '지윤은 Neo4j를 사용한다.');
        created = await context.wiki.createDocument(
          context.org,
          context.actor,
          {
            parentDocumentId: null,
            title: '현재 의미 제목',
            position: 0,
            contentMarkdown: doc.getText('markdown').toString(),
          },
          {
            encodedState: Y.encodeStateAsUpdate(doc),
            contentMarkdown: doc.getText('markdown').toString(),
          },
          1,
        );
      } finally {
        doc.destroy();
      }
      const before = created.updatedAt;
      await waitForCondition(
        async () =>
          (await context.queue.getJobs(['delayed'])).some((job) => {
            const data = SemanticJobDataSchema.safeParse(job.data);
            return (
              job.name === SEMANTIC_AUTO_JOB &&
              data.success &&
              data.data.organizationId === context.org &&
              data.data.aggregateId === created.id
            );
          }),
        '자동 quiet 작업이 지연 queue에 없습니다.',
        { timeoutMs: 15_000 },
      );
      const auto = (await context.queue.getJobs(['delayed'])).find((job) => {
        const data = SemanticJobDataSchema.safeParse(job.data);
        return (
          job.name === SEMANTIC_AUTO_JOB &&
          data.success &&
          data.data.organizationId === context.org &&
          data.data.aggregateId === created.id
        );
      });
      if (!auto) throw new Error('자동 quiet 작업이 없습니다.');
      expect(auto.opts.delay).toBeGreaterThan(290_000);
      const firstRequest = await context.refresh.requestManualRefresh(
        context.org,
        created.id,
        context.actor,
      );
      if (firstRequest.outcome !== 'accepted')
        throw new Error('수동 요청이 접수되지 않았습니다.');
      await context.indexed(created.id, 1);
      const first = await context.app.get(OutboxSemanticSourceState).current({
        organizationId: context.org,
        aggregateKind: 'wiki_document',
        aggregateId: created.id,
      });
      expect(first?.state?.indexedSourceUpdatedAt).toEqual(before);
      expect(
        context.extractor.calls.filter(
          (text) => text === created.contentMarkdown,
        ).length,
      ).toBe(1);
      expect(
        context.embedder.calls.filter((texts) =>
          texts.some((text) => text.includes('현재 의미 제목')),
        ).length,
      ).toBe(1);
      const generation = first?.state?.activeGenerationId;
      expect(
        await context.graph.query(
          'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation RETURN count(c) AS chunks, size(head(collect(c.embedding))) AS dimension',
          { org: context.org, generation },
        ),
      ).toEqual([{ chunks: '1', dimension: '768' }]);
      await context.refresh.requestManualRefresh(
        context.org,
        created.id,
        context.actor,
      );
      await context.indexed(created.id, 2);
      const second = await context.app.get(OutboxSemanticSourceState).current({
        organizationId: context.org,
        aggregateKind: 'wiki_document',
        aggregateId: created.id,
      });
      expect(second?.state?.activeGenerationId).not.toBe(generation);
      expect(second?.state?.indexedSignature).toBe(
        first?.state?.indexedSignature,
      );
      expect(second?.state?.indexedSourceUpdatedAt).toEqual(before);
      expect(
        context.extractor.calls.filter(
          (text) => text === created.contentMarkdown,
        ).length,
      ).toBe(2);
      expect(await auto.getState()).toBe('delayed');
      await auto.promote();
      await waitForCondition(
        async () => (await auto.getState()) === 'completed',
        '만족한 자동 작업이 no-op으로 끝나지 않았습니다.',
        { timeoutMs: 15_000 },
      );
      expect(
        context.extractor.calls.filter(
          (text) => text === created.contentMarkdown,
        ).length,
      ).toBe(2);
      expect(
        context.embedder.calls.filter((texts) =>
          texts.some((text) => text.includes('현재 의미 제목')),
        ).length,
      ).toBe(2);
      const manualId = `kg-semantic-manual-${firstRequest.requestId}`;
      await waitForCondition(
        async () =>
          (await context.queue.getJob(manualId))
            ?.getState()
            .then((status) => status === 'completed') ?? false,
        '첫 수동 queue 처리가 완료되지 않았습니다.',
      );
      const completed = await context.queue.getJob(manualId);
      if (!completed) throw new Error('첫 수동 history가 없습니다.');
      const previousTimestamp = completed.timestamp;
      await context.app.get(SemanticJobQueueProvider).manual(
        {
          organizationId: context.org,
          aggregateKind: 'wiki_document',
          aggregateId: created.id,
        },
        firstRequest.requestId,
      );
      await waitForCondition(async () => {
        const replaced = await context.queue.getJob(manualId);
        return (
          replaced !== undefined &&
          replaced.timestamp > previousTimestamp &&
          (await replaced.getState()) === 'completed'
        );
      }, '완료 history가 새 영속 요구의 재접수를 막았습니다.');
      expect(
        context.extractor.calls.filter(
          (text) => text === created.contentMarkdown,
        ).length,
      ).toBe(2);
      expect(
        await context.database
          .select()
          .from(outboxSemanticSourceState)
          .where(eq(outboxSemanticSourceState.organizationId, context.org)),
      ).toHaveLength(1);
    });

    it('Q7-05 유효 lease로 바쁜 수동 작업은 attempts를 소모하지 않고 지연한 뒤 재개한다', async () => {
      await context.queue.pause();
      const doc = new Y.Doc();
      let created;
      try {
        doc.getText('markdown').insert(0, '바쁜 source의 재개를 검증한다.');
        created = await context.wiki.createDocument(
          context.org,
          context.actor,
          {
            parentDocumentId: null,
            title: '바쁜 의미 원본',
            position: 1,
            contentMarkdown: doc.getText('markdown').toString(),
          },
          {
            encodedState: Y.encodeStateAsUpdate(doc),
            contentMarkdown: doc.getText('markdown').toString(),
          },
          1,
        );
      } finally {
        doc.destroy();
      }
      const request = await context.refresh.requestManualRefresh(
        context.org,
        created.id,
        context.actor,
      );
      if (request.outcome !== 'accepted')
        throw new Error('수동 요청이 없습니다.');
      const scope = {
        organizationId: context.org,
        aggregateKind: 'wiki_document',
        aggregateId: created.id,
      } as const;
      const state = context.app.get(OutboxSemanticSourceState);
      const lease = await state.acquireLease(scope, 'a'.repeat(64));
      if (typeof lease === 'string')
        throw new Error('바쁜 source lease가 없습니다.');
      await context.queue.resume();
      const id = `kg-semantic-manual-${request.requestId}`;
      await waitForCondition(
        async () =>
          (await context.queue.getJob(id))
            ?.getState()
            .then((status) => status === 'delayed') ?? false,
        '바쁜 작업이 지연되지 않았습니다.',
        { timeoutMs: 15_000 },
      );
      const delayed = await context.queue.getJob(id);
      if (!delayed) throw new Error('바쁜 지연 작업이 없습니다.');
      expect(delayed.attemptsMade).toBe(0);
      expect(
        context.extractor.calls.filter(
          (text) => text === created.contentMarkdown,
        ).length,
      ).toBe(0);
      expect(
        await state.release(scope, lease, {
          runStatus: 'idle',
          lastErrorCode: null,
        }),
      ).toBe(true);
      await delayed.promote();
      await context.indexed(created.id, 1);
      expect(
        context.extractor.calls.filter(
          (text) => text === created.contentMarkdown,
        ).length,
      ).toBe(1);
    });
  },
);
