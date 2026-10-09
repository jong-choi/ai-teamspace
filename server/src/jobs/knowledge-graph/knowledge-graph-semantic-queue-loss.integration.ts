import { KnowledgeGraphSemanticReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-semantic-reconciliation.scheduler';
import {
  createSemanticFlowContext,
  describeSemanticFlow,
} from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';

jest.setTimeout(60_000);

describeSemanticFlow('실제 의미 queue 유실 뒤 영속 수동 요청 복구', () => {
  const context = createSemanticFlowContext();
  it('F7-16 수동 전달 후 자기 queue 데이터가 유실돼도 PG gap으로 추가 quiet 없이 복구한다', async () => {
    await context.queue.pause();
    const text = 'queue 유실 뒤 수동 원본을 복구한다.';
    const source = await context.createWiki('수동 queue 유실', text);
    const scope = {
      organizationId: context.org,
      aggregateKind: 'wiki_document',
      aggregateId: source.id,
    } as const;
    let state = context.app.get(OutboxSemanticSourceState);
    const request = await context.refresh.requestManualRefresh(
      context.org,
      source.id,
      context.actor,
    );
    if (request.outcome !== 'accepted')
      throw new Error('수동 접수가 없습니다.');
    const jobId = `kg-semantic-manual-${request.requestId}`;
    await waitForCondition(
      async () =>
        Boolean(await context.queue.getJob(jobId)) &&
        (await state.current(scope))?.state?.manualDeliveredSeq === 1,
      '실제 queue 전달을 확인하지 못했습니다.',
    );
    expect(
      context.extractor.calls.filter((value) => value === text).length,
    ).toBe(0);
    await context.queue.obliterate({ force: true });
    expect(await context.queue.getJob(jobId)).toBeUndefined();
    const before = await state.current(scope);
    expect(before?.state).toMatchObject({
      manualRequestSeq: 1,
      indexedManualSeq: 0,
      activeGenerationId: null,
    });
    const started = Date.now();
    await context.restartJobs();
    state = context.app.get(OutboxSemanticSourceState);
    await context.app
      .get(KnowledgeGraphSemanticReconciliationScheduler)
      .runOnce();
    await context.queue.resume();
    await context.indexed(source.id, 1);
    expect(Date.now() - started).toBeLessThan(30_000);
    expect(
      context.extractor.calls.filter((value) => value === text).length,
    ).toBe(1);
    const after = await state.current(scope);
    expect(after?.state?.indexedSourceUpdatedAt).toEqual(source.updatedAt);
    expect(after?.state?.manualRequestId).toBe(request.requestId);
  });
});
