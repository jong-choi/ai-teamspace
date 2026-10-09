import { randomUUID } from 'node:crypto';

import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';

jest.setTimeout(60_000);

describeKnowledgeGraph('문서 삭제와 진행 중 수동 추출의 최신 원본 경합', () => {
  const context = createSemanticFlowContext();
  it('F7-10·17 수동 추출 중 삭제와 늦은 작업은 원본을 부활시키지 않는다', async () => {
    const text = '삭제 경합에서 지윤의 이전 추출을 검증한다.';
    const source = await context.createWiki('삭제 경합 문서', text);
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
    let release = () => {};
    let entered = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    context.extractor.beforeExtract.set(text, async () => {
      entered = true;
      await held;
    });
    try {
      await context.refresh.requestManualRefresh(
        context.org,
        source.id,
        context.actor,
      );
      await waitForCondition(
        async () => entered,
        '수동 추출 경합 지점이 없습니다.',
      );
      expect(await context.wiki.deleteDocument(context.org, source.id)).toBe(
        'deleted',
      );
      expect((await state.current(scope))?.version.deleted).toBe(true);
      expect(
        await context.refresh.requestManualRefresh(
          context.org,
          source.id,
          context.actor,
        ),
      ).toEqual({ outcome: 'not_found' });
    } finally {
      context.extractor.beforeExtract.delete(text);
      release();
    }
    await waitForCondition(
      async () => {
        const current = await state.current(scope);
        return (
          current?.state?.activeGenerationId === null &&
          current.state.indexedSeq === current.version.desiredSeq
        );
      },
      '삭제된 source가 PG에서 비활성화되지 않았습니다.',
      { timeoutMs: 30_000 },
    );
    const calls = context.extractor.calls.filter(
      (value) => value === text,
    ).length;
    const queue = context.app.get(SemanticJobQueueProvider);
    await queue.auto(scope, 0);
    const requestId = randomUUID();
    await queue.manual(scope, requestId);
    const lateId = `kg-semantic-manual-${requestId}`;
    await waitForCondition(
      async () => {
        const job = await context.queue.getJob(lateId);
        if (!job) return false;
        const status = await job.getState();
        if (status === 'delayed') {
          await job.promote();
          return false;
        }
        if (status === 'failed')
          throw new Error('늦은 수동 작업이 실패 상태입니다.');
        return status === 'completed';
      },
      '늦은 수동 작업이 끝나지 않았습니다.',
      { timeoutMs: 30_000 },
    );
    expect(
      context.extractor.calls.filter((value) => value === text).length,
    ).toBe(calls);
    expect((await state.current(scope))?.state?.activeGenerationId).toBeNull();
    expect(
      await context.wiki.findDocumentById(context.org, source.id),
    ).toBeNull();
  });
});
