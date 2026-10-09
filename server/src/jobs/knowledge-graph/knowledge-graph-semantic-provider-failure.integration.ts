import { Logger } from '@nestjs/common';

import { KnowledgeGraphSemanticReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-semantic-reconciliation.scheduler';
import { SemanticProviderError } from '@/knowledge-graph/domain/semantic-error';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';

jest.setTimeout(60_000);

describeKnowledgeGraph(
  '공급자 실패의 실제 Jobs 시도 상한과 기존 활성 세대 보존',
  () => {
    const context = createSemanticFlowContext();
    afterEach(() => jest.restoreAllMocks());

    it.each([
      { code: 'PROVIDER_UNAUTHORIZED', attempts: 1 },
      { code: 'PROVIDER_RATE_LIMITED', attempts: 5 },
      { code: 'PROVIDER_TIMEOUT', attempts: 4 },
      { code: 'PROVIDER_UNAVAILABLE', attempts: 4 },
    ] as const)(
      'F7-12 $code는 실제 호출 $attempts회로 종결하고 새 수동 요청만 회복한다',
      async ({ code, attempts }) => {
        const text = `실제 Jobs의 ${code} 실패를 검증한다.`;
        const created = await context.createWiki(`실패 보존 ${code}`, text);
        const scope = {
          organizationId: context.org,
          aggregateKind: 'wiki_document',
          aggregateId: created.id,
        } as const;
        const state = context.app.get(OutboxSemanticSourceState);
        await context.refresh.requestManualRefresh(
          context.org,
          created.id,
          context.actor,
        );
        await context.indexed(created.id, 1);
        const active = (await state.current(scope))?.state?.activeGenerationId;
        expect(active).toBeTruthy();
        const before = context.extractor.calls.filter(
          (value) => value === text,
        ).length;
        const canary = 'p7-provider-synthetic-secret-canary';
        const error = new SemanticProviderError(
          code,
          code === 'PROVIDER_RATE_LIMITED' ? 10 : null,
        );
        error.message = canary;
        const logging = [
          jest.spyOn(Logger.prototype, 'log'),
          jest.spyOn(Logger.prototype, 'warn'),
          jest.spyOn(Logger.prototype, 'error'),
        ];
        for (const logger of logging) logger.mockImplementation(() => {});
        if (attempts === 4) await context.queue.pause();
        context.extractor.failures.set(text, error);
        const request = await context.refresh.requestManualRefresh(
          context.org,
          created.id,
          context.actor,
        );
        if (request.outcome !== 'accepted')
          throw new Error('실패 검증 수동 요청이 없습니다.');
        if (attempts === 4) {
          const id = `kg-semantic-manual-${request.requestId}`;
          await waitForCondition(
            async () => Boolean(await context.queue.getJob(id)),
            '수동 job 접수가 없습니다.',
          );
          const job = await context.queue.getJob(id);
          if (!job) throw new Error('수동 job이 없습니다.');
          await job.remove();
          await context.queue.add(job.name, job.data, {
            ...job.opts,
            jobId: id,
            backoff: { type: 'exponential', delay: 1 },
          });
          await context.queue.resume();
        }
        await waitForCondition(
          async () =>
            (await state.current(scope))?.state?.runStatus === 'failed',
          '공급자 실패가 PG에서 종결되지 않았습니다.',
          { timeoutMs: 30_000 },
        );
        const failedJobId = `kg-semantic-manual-${request.requestId}`;
        await waitForCondition(
          async () =>
            (await context.queue.getJob(failedJobId))
              ?.getState()
              .then((status) => status === 'failed') ?? false,
          '종결 작업이 실제 queue failed에 없습니다.',
        );
        expect(
          context.extractor.calls.filter((value) => value === text).length -
            before,
        ).toBe(attempts);
        const failed = await state.current(scope);
        expect(failed?.state).toMatchObject({
          activeGenerationId: active,
          indexedManualSeq: 1,
          manualRequestSeq: 2,
          lastErrorCode: code,
          leaseToken: null,
        });
        const scheduler = context.app.get(
          KnowledgeGraphSemanticReconciliationScheduler,
        );
        await scheduler.runOnce();
        await scheduler.runOnce();
        expect(
          context.extractor.calls.filter((value) => value === text).length -
            before,
        ).toBe(attempts);
        expect((await state.current(scope))?.state?.runStatus).toBe('failed');
        context.extractor.failures.delete(text);
        await context.refresh.requestManualRefresh(
          context.org,
          created.id,
          context.actor,
        );
        await context.indexed(created.id, 3);
        expect(
          (await state.current(scope))?.state?.activeGenerationId,
        ).not.toBe(active);
        expect((await state.current(scope))?.state?.lastErrorCode).toBeNull();
        expect(
          logging.every(
            (logger) => !JSON.stringify(logger.mock.calls).includes(canary),
          ),
        ).toBe(true);
        expect(
          (await context.queue.getJob(failedJobId))?.failedReason,
        ).not.toContain(canary);
      },
    );
  },
);
