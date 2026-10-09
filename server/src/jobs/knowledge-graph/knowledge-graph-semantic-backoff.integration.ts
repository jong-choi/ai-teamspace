import { OutboxRelay } from '@nestjs/outbox';

import {
  SEMANTIC_AUTO_JOB,
  SemanticJobDataSchema,
} from '@/jobs/knowledge-graph/knowledge-graph-semantic.job';
import { SemanticProviderError } from '@/knowledge-graph/domain/semantic-error';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';
import { outboxSemanticSourceState as stateTable } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { eq } from 'drizzle-orm';

jest.setTimeout(60_000);
describeKnowledgeGraph(
  '실제 debounce의 backoff 교체와 영속 재시도 상한',
  () => {
    const context = createSemanticFlowContext();
    it('Q7-06 같은 요구의 backoff job을 매번 교체해도 실제 모델4회로 종결하고 기존 active를 보존한다', async () => {
      const source = await context.createWiki(
        'backoff 교체',
        '교체 전 활성 본문',
      );
      const scope = {
        organizationId: context.org,
        aggregateKind: 'wiki_document',
        aggregateId: source.id,
      } as const;
      const state = context.app.get(OutboxSemanticSourceState);
      await context.refresh.requestManualRefresh(
        context.org,
        source.id,
        context.actor,
      );
      await context.indexed(source.id, 1);
      const active = (await state.current(scope))?.state?.activeGenerationId;
      const changed = '교체 뒤 공급자 장애가 난 본문';
      await context.replaceWikiBody(source.id, changed);
      await waitForCondition(
        async () => (await state.current(scope))?.state?.observedSeq === 2,
        '새 본문 관측이 없습니다.',
      );
      for (const relay of context.app.get(OutboxRelay, { each: true }))
        await relay.stop();
      const past = new Date(Date.now() - 360_000);
      await context.database
        .update(wikiDocument)
        .set({ updatedAt: past })
        .where(eq(wikiDocument.id, source.id));
      await context.database
        .update(stateTable)
        .set({ observedAt: past })
        .where(eq(stateTable.aggregateId, source.id));
      context.extractor.failures.set(
        changed,
        new SemanticProviderError('PROVIDER_UNAVAILABLE'),
      );
      const queue = context.app.get(SemanticJobQueueProvider);
      await queue.auto(scope, 0);
      for (let attempts = 1; attempts <= 4; attempts++) {
        await waitForCondition(async () => {
          const current = (await state.current(scope))?.state;
          return (
            current?.retryCount === attempts &&
            current.runStatus === (attempts === 4 ? 'failed' : 'retry_waiting')
          );
        }, `영속 시도${attempts}회 상태가 없습니다.`);
        if (attempts < 4) {
          await waitForCondition(
            async () =>
              (await context.queue.getJobs(['delayed'])).some((job) => {
                const data = SemanticJobDataSchema.safeParse(job.data);
                return (
                  job.name === SEMANTIC_AUTO_JOB &&
                  data.success &&
                  data.data.aggregateId === source.id &&
                  job.attemptsMade === 1
                );
              }),
            '첫 native attempt 뒤 backoff를 확인하지 못했습니다.',
          );
          await queue.auto(scope, 0);
        }
      }
      expect(
        context.extractor.calls.filter((text) => text === changed),
      ).toHaveLength(4);
      expect((await state.current(scope))?.state).toMatchObject({
        runStatus: 'failed',
        retryCount: 4,
        activeGenerationId: active,
        indexedSeq: 1,
        lastErrorCode: 'PROVIDER_UNAVAILABLE',
      });
      await queue.auto(scope, 0);
      await waitForCondition(
        async () =>
          (await context.queue.getJobs(['completed'])).some((job) => {
            const data = SemanticJobDataSchema.safeParse(job.data);
            return (
              job.name === SEMANTIC_AUTO_JOB &&
              data.success &&
              data.data.aggregateId === source.id
            );
          }),
        'terminal 요구의 늦은 job이 종료되지 않았습니다.',
      );
      expect(
        context.extractor.calls.filter((text) => text === changed),
      ).toHaveLength(4);
      expect((await state.current(scope))?.state?.runStatus).toBe('failed');
    });
  },
);
