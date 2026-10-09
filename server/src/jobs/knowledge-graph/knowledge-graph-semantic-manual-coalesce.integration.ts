import {
  createSemanticFlowContext,
  describeSemanticFlow,
} from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';

jest.setTimeout(60_000);

describeSemanticFlow(
  '실제 다중 사용자의 수동 요청 합치기와 최신 seq 활성화',
  () => {
    const context = createSemanticFlowContext();
    it('F7-09 세 사용자의10회 클릭은 실행중1개와후속1개로 합쳐 최신 manualSeq2를 만족한다', async () => {
      const text = '여러 사용자의 수동 클릭을 합친다.';
      const source = await context.createWiki('다중 수동 사용자', text);
      const actors = [
        context.actor,
        await context.createActor(),
        await context.createActor(),
      ];
      const scope = {
        organizationId: context.org,
        aggregateKind: 'wiki_document',
        aggregateId: source.id,
      } as const;
      let release = () => {};
      let entered = false;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      context.extractor.beforeExtract.set(text, async () => {
        entered = true;
        await barrier;
      });
      let nextRequestId: string | null = null;
      try {
        await context.refresh.requestManualRefresh(
          context.org,
          source.id,
          context.actor,
        );
        await waitForCondition(
          async () => entered,
          '첫 실행이 시작되지 않았습니다.',
        );
        const requests = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            context.refresh.requestManualRefresh(
              context.org,
              source.id,
              actors[i % actors.length],
            ),
          ),
        );
        const accepted = requests.filter(
          (request) => request.outcome === 'accepted',
        );
        expect(accepted).toHaveLength(10);
        expect(new Set(accepted.map((request) => request.requestId)).size).toBe(
          1,
        );
        expect(
          accepted.every((request) => request.manualRequestSeq === 2),
        ).toBe(true);
        expect(accepted.filter((request) => !request.coalesced)).toHaveLength(
          1,
        );
        nextRequestId = accepted[0].requestId;
      } finally {
        release();
        context.extractor.beforeExtract.delete(text);
      }
      if (!nextRequestId) throw new Error('후속 요청이 없습니다.');
      const nextId = `kg-semantic-manual-${nextRequestId}`;
      const next = await context.queue.getJob(nextId);
      if (next && (await next.getState()) === 'delayed') await next.promote();
      await context.indexed(source.id, 2);
      expect(
        context.extractor.calls.filter((value) => value === text).length,
      ).toBeLessThanOrEqual(2);
      const current = await context.app
        .get(OutboxSemanticSourceState)
        .current(scope);
      expect(current?.state).toMatchObject({
        manualRequestSeq: 2,
        indexedManualSeq: 2,
        runStatus: 'idle',
        lastErrorCode: null,
      });
      expect(
        await context.graph.query(
          'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation RETURN count(c) AS latest',
          { org: context.org, generation: current?.state?.activeGenerationId },
        ),
      ).toEqual([{ latest: '1' }]);
    });
  },
);
