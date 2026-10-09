import { KnowledgeGraphSemanticReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-semantic-reconciliation.scheduler';
import {
  createSemanticFlowContext,
  describeSemanticFlow,
} from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';

jest.setTimeout(60_000);
describeSemanticFlow(
  '수동 실행 중 제목 변경과 다른 조직 동명 원본 보존',
  () => {
    const context = createSemanticFlowContext();
    it('F7-10 같은 이름의 다른 조직은 보존하고 제목 변경 전 결과는 거부한 뒤 최신 수동 요구를 복구한다', async () => {
      const otherOrg = await context.createAdditionalOrganization();
      const other = await context.createWiki(
        '동명 위키',
        '다른 조직의 동명 의미 원본',
        otherOrg,
      );
      const state = context.app.get(OutboxSemanticSourceState);
      const otherScope = {
        organizationId: otherOrg,
        aggregateKind: 'wiki_document',
        aggregateId: other.id,
      } as const;
      await context.refresh.requestManualRefresh(
        otherOrg,
        other.id,
        context.actor,
      );
      await context.indexed(other.id, 1, 40_000, otherOrg);
      const otherBefore = await state.current(otherScope);
      const text = '수동 제목 경합의 현재 본문';
      const source = await context.createWiki('동명 위키', text);
      let release = () => {};
      let entered = false;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      context.extractor.beforeExtract.set(text, async () => {
        entered = true;
        await barrier;
      });
      const request = await context.refresh.requestManualRefresh(
        context.org,
        source.id,
        context.actor,
      );
      if (request.outcome !== 'accepted')
        throw new Error('수동 접수가 없습니다.');
      try {
        await waitForCondition(
          () => entered,
          '수동 추출 시작을 확인하지 못했습니다.',
          { timeoutMs: 10_000 },
        );
        await context.wiki.updateDocumentMetadata(
          context.org,
          source.id,
          context.actor,
          { title: '변경된 최신 제목', parentDocumentId: null, position: 1 },
        );
        context.extractor.beforeExtract.delete(text);
        release();
        await waitForCondition(
          async () =>
            (
              await context.queue.getJob(
                `kg-semantic-manual-${request.requestId}`,
              )
            )
              ?.getState()
              .then((value) => value === 'completed') ?? false,
          '이전 수동 실행이 끝나지 않았습니다.',
        );
        const scope = {
          organizationId: context.org,
          aggregateKind: 'wiki_document',
          aggregateId: source.id,
        } as const;
        expect((await state.current(scope))?.state?.indexedSeq).toBe(0);
        await context.app
          .get(KnowledgeGraphSemanticReconciliationScheduler)
          .runOnce();
        await context.indexed(source.id, 1);
        expect((await state.current(scope))?.state?.indexedSeq).toBe(2);
        expect(
          context.extractor.calls.filter((value) => value === text),
        ).toHaveLength(2);
        expect(await state.current(otherScope)).toMatchObject({
          state: {
            activeGenerationId: otherBefore?.state?.activeGenerationId,
            indexedSeq: 1,
            indexedManualSeq: 1,
          },
        });
        expect(
          await context.graph.query(
            'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.sourceId=$source RETURN count(c) AS chunks',
            { org: context.org, source: source.id },
          ),
        ).toEqual([{ chunks: '1' }]);
        expect(
          context.embedder.calls.some((values) =>
            values.some((value) =>
              value.startsWith('title: 변경된 최신 제목 |'),
            ),
          ),
        ).toBe(true);
      } finally {
        context.extractor.beforeExtract.delete(text);
        release();
      }
    });
  },
);
