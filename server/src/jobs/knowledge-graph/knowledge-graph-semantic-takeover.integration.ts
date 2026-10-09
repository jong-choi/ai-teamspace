import { KnowledgeGraphSemanticProcessor } from '@/jobs/knowledge-graph/knowledge-graph-semantic.processor';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import {
  createSemanticFlowContext,
  describeSemanticFlow,
} from '@/knowledge-graph/testing/semantic-flow.context';
import { outboxSemanticSourceState } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { and, eq } from 'drizzle-orm';
import * as Y from 'yjs';

jest.setTimeout(60_000);

describeSemanticFlow('본문 변경과 만료 lease의 두 Jobs takeover', () => {
  const context = createSemanticFlowContext();
  it('F7-06 이전 추출이 늦게 끝나도 둘째 Jobs의 최신 snapshot과 활성 세대를 덮지 않는다', async () => {
    const oldText = '이전 추출 본문';
    const latestText = '최신 본문이 두 Jobs 경합에서 이긴다.';
    const source = await context.createWiki('takeover 원본', oldText);
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
    context.extractor.beforeExtract.set(oldText, async () => {
      entered = true;
      await barrier;
    });
    const state = context.app.get(OutboxSemanticSourceState);
    let requestId: string | null = null;
    let latestGeneration: string | null = null;
    try {
      const request = await context.refresh.requestManualRefresh(
        context.org,
        source.id,
        context.actor,
      );
      if (request.outcome !== 'accepted')
        throw new Error('첫 요청이 없습니다.');
      requestId = request.requestId;
      await waitForCondition(
        async () => entered,
        '이전 run이 시작되지 않았습니다.',
      );
      await context.app.get(KnowledgeGraphSemanticProcessor).worker.pause(true);
      const loaded = await context.wiki.loadCollaborationState(
        context.org,
        source.id,
      );
      if (!loaded) throw new Error('본문 원본이 없습니다.');
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, loaded.collaborationState);
        doc.getText('markdown').delete(0, doc.getText('markdown').length);
        doc.getText('markdown').insert(0, latestText);
        await context.wiki.persistCollaborationSnapshot(
          context.org,
          source.id,
          {
            encodedState: Y.encodeStateAsUpdate(doc),
            contentMarkdown: latestText,
          },
          context.actor,
          [context.actor],
          1,
          false,
        );
      } finally {
        doc.destroy();
      }
      await context.database
        .update(outboxSemanticSourceState)
        .set({ leaseExpiresAt: new Date(0) })
        .where(
          and(
            eq(outboxSemanticSourceState.organizationId, context.org),
            eq(outboxSemanticSourceState.aggregateId, source.id),
          ),
        );
      const second = await context.startJobs();
      await second.get(SemanticJobQueueProvider).auto(scope, 0);
      await context.indexed(source.id, 1);
      const current = await state.current(scope);
      latestGeneration = current?.state?.activeGenerationId ?? null;
      expect(current?.state?.fenceToken).toBeGreaterThanOrEqual(2);
      expect(current?.state?.indexedSeq).toBe(2);
      expect(
        await context.graph.query(
          'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation RETURN c.text AS text',
          { org: context.org, generation: latestGeneration },
        ),
      ).toEqual([{ text: latestText }]);
    } finally {
      release();
      context.extractor.beforeExtract.delete(oldText);
    }
    if (!requestId) throw new Error('이전 요청 정보가 없습니다.');
    await waitForCondition(
      async () =>
        (await context.queue.getJob(`kg-semantic-manual-${requestId}`))
          ?.getState()
          .then((status) => status === 'completed') ?? false,
      '이전 run이 종료되지 않았습니다.',
      { timeoutMs: 30_000 },
    );
    expect((await state.current(scope))?.state?.activeGenerationId).toBe(
      latestGeneration,
    );
    expect(
      context.extractor.calls.filter((text) => text === oldText).length,
    ).toBe(1);
    expect(
      context.extractor.calls.filter((text) => text === latestText).length,
    ).toBe(1);
  });
});
