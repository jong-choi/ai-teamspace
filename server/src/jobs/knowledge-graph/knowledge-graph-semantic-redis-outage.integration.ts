import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { KnowledgeGraphSemanticReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-semantic-reconciliation.scheduler';
import { deriveSemanticIndexStatus } from '@/knowledge-graph/domain/semantic-index-status';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import {
  createSemanticFlowContext,
  describeSemanticFlow,
} from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';

const docker = promisify(execFile);
jest.setTimeout(60_000);
describeSemanticFlow('격리 Redis 장애 중 영속 수동 접수와 즉시 복구', () => {
  const context = createSemanticFlowContext();
  it('F7-08 Redis 장애에도 PG 접수·accepted를 보존하고 복구 뒤 추가 quiet 없이 완료한다', async () => {
    if (process.env.REDIS_QUEUE_URL !== 'redis://127.0.0.1:46380/0')
      throw new Error('이 시험은 소유 검증 Redis에서만 실행합니다.');
    const source = await context.createWiki(
      'Redis 장애 수동 접수',
      'Redis 장애에서도 영속 수동 요청을 잃지 않는다.',
    );
    const scope = {
      organizationId: context.org,
      aggregateKind: 'wiki_document',
      aggregateId: source.id,
    } as const;
    const state = context.app.get(OutboxSemanticSourceState);
    await waitForCondition(
      async () => (await state.current(scope))?.state?.observedSeq === 1,
      '원본 관측이 없습니다.',
    );
    await docker('docker', ['pause', 'workos-graph-verification-redis']);
    try {
      const requested = await context.refresh.requestManualRefresh(
        context.org,
        source.id,
        context.actor,
      );
      expect(requested.outcome).toBe('accepted');
      const pending = await state.current(scope);
      expect(
        deriveSemanticIndexStatus(
          pending,
          source.updatedAt,
          semanticPipelineFingerprint,
        )?.status,
      ).toBe('accepted');
      expect(pending?.state).toMatchObject({
        manualRequestSeq: 1,
        manualDeliveredSeq: 0,
        indexedManualSeq: 0,
        activeGenerationId: null,
      });
      expect(context.extractor.calls).toHaveLength(0);
      expect(
        await context.app
          .get(KnowledgeGraphSemanticReconciliationScheduler)
          .runOnce(),
      ).toBe(0);
      expect((await state.current(scope))?.state?.lastRequeuedAt).toBeNull();
    } finally {
      await docker('docker', ['unpause', 'workos-graph-verification-redis']);
    }
    const recoveredAt = performance.now();
    await context.app
      .get(KnowledgeGraphSemanticReconciliationScheduler)
      .runOnce();
    await context.indexed(source.id, 1);
    expect(performance.now() - recoveredAt).toBeLessThan(30_000);
    expect(
      context.extractor.calls.filter((text) => text === source.contentMarkdown),
    ).toHaveLength(1);
    expect((await state.current(scope))?.state?.indexedSourceUpdatedAt).toEqual(
      source.updatedAt,
    );
  });
});
