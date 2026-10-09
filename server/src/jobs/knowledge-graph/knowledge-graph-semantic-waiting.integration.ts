import { OutboxRelay } from '@nestjs/outbox';

import {
  SEMANTIC_AUTO_JOB,
  SemanticJobDataSchema,
} from '@/jobs/knowledge-graph/knowledge-graph-semantic.job';
import { KnowledgeGraphSemanticProcessor } from '@/jobs/knowledge-graph/knowledge-graph-semantic.processor';
import {
  createSemanticFlowContext,
  describeSemanticFlow,
} from '@/knowledge-graph/testing/semantic-flow.context';
import { outboxSemanticSourceState as stateTable } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { eq } from 'drizzle-orm';

jest.setTimeout(60_000);
describeSemanticFlow(
  'waiting 자동 작업의 최신 PG 재조회와 quiet 자기 재예약',
  () => {
    const context = createSemanticFlowContext();
    it('Q7-03 waiting에서 버려진 재접수도 현재 PG 요구를 읽고 quiet 뒤 최신 세대 하나만 활성화한다', async () => {
      const worker = context.app.get(KnowledgeGraphSemanticProcessor).worker;
      await worker.pause();
      try {
        const source = await context.createWiki(
          'waiting 자동 원본',
          'waiting 이전 본문',
        );
        const scope = {
          organizationId: context.org,
          aggregateKind: 'wiki_document',
          aggregateId: source.id,
        } as const;
        const state = context.app.get(OutboxSemanticSourceState);
        const jobs = async () =>
          (await context.queue.getJobs(['waiting', 'delayed'])).filter(
            (job) => {
              const data = SemanticJobDataSchema.safeParse(job.data);
              return (
                job.name === SEMANTIC_AUTO_JOB &&
                data.success &&
                data.data.aggregateId === source.id
              );
            },
          );
        await waitForCondition(
          async () => (await jobs()).length === 1,
          '자동 delayed 작업이 없습니다.',
        );
        const first = (await jobs())[0];
        if (!first) throw new Error('자동 작업이 없습니다.');
        await first.promote();
        expect(await first.getState()).toBe('waiting');
        await context.replaceWikiBody(source.id, 'waiting 최신 본문');
        await waitForCondition(
          async () => (await state.current(scope))?.state?.observedSeq === 2,
          '최신 본문 관측이 없습니다.',
        );
        for (const relay of context.app.get(OutboxRelay, { each: true }))
          await relay.stop();
        expect((await jobs())[0]?.id).toBe(first.id);
        expect(context.extractor.calls).toHaveLength(0);
        worker.resume();
        await waitForCondition(
          async () => (await first.getState()) === 'completed',
          '조기 waiting 작업의 재예약이 없습니다.',
        );
        await waitForCondition(
          async () => (await jobs()).some((job) => job.delay > 290_000),
          '최신 PG quiet 작업이 없습니다.',
        );
        expect(context.extractor.calls).toHaveLength(0);
        const past = new Date(Date.now() - 360_000);
        await context.database
          .update(wikiDocument)
          .set({ updatedAt: past })
          .where(eq(wikiDocument.id, source.id));
        await context.database
          .update(stateTable)
          .set({ observedAt: past })
          .where(eq(stateTable.aggregateId, source.id));
        const delayed = (await jobs())[0];
        if (!delayed) throw new Error('후속 delayed 작업이 없습니다.');
        await delayed.promote();
        await context.indexed(source.id, 0);
        expect(context.extractor.calls).toEqual(['waiting 최신 본문']);
        expect((await state.current(scope))?.state?.indexedSeq).toBe(2);
      } finally {
        worker.resume();
      }
    });
  },
);
