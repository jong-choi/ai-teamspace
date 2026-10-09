import {
  createSemanticFlowContext,
  describeSemanticFlow,
} from '@/knowledge-graph/testing/semantic-flow.context';
import { outboxSemanticSourceState as state } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { and, eq, isNotNull } from 'drizzle-orm';

describeSemanticFlow('실제 Jobs의100문서×3chunk 처리량 측정', () => {
  jest.setTimeout(360_000);
  const context = createSemanticFlowContext();
  it('F7-19 기본 동시성·분당 작업 시작 상한을 유지한100문서를 모두 활성화하고 시간과 호출 수를 기록한다', async () => {
    await context.queue.pause();
    const started = performance.now();
    for (let index = 0; index < 100; index++) {
      const text = Array.from(
        { length: 3 },
        (_, section) =>
          `## 문서${index} 정보${section}\n${'세 chunk 처리량 측정의 의미 원본을 검증한다. '.repeat(65)}`,
      ).join('\n\n');
      const created = await context.createWiki(`처리량 문서${index}`, text);
      await context.refresh.requestManualRefresh(
        context.org,
        created.id,
        context.actor,
      );
    }
    await context.queue.resume();
    const where = and(
      eq(state.organizationId, context.org),
      eq(state.indexedSeq, 1),
      eq(state.indexedManualSeq, 1),
      isNotNull(state.activeGenerationId),
    );
    await waitForCondition(
      async () =>
        (
          await context.database
            .select({ generation: state.activeGenerationId })
            .from(state)
            .where(where)
        ).length === 100,
      '100문서의 색인이 제한 시간 안에 완료되지 않았습니다.',
      {
        timeoutMs: 330_000,
        pause: () => new Promise((resolve) => setTimeout(resolve, 500)),
      },
    );
    const rows = await context.database
      .select({ generation: state.activeGenerationId })
      .from(state)
      .where(where);
    expect(rows).toHaveLength(100);
    expect(new Set(rows.map((row) => row.generation)).size).toBe(100);
    expect(context.extractor.calls).toHaveLength(300);
    expect(context.embedder.calls).toHaveLength(100);
    expect(context.embedder.calls.every((texts) => texts.length === 3)).toBe(
      true,
    );
    expect(
      await context.graph.query(
        'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org RETURN count(c) AS chunks, count(DISTINCT c.generationId) AS generations',
        { org: context.org },
      ),
    ).toEqual([{ chunks: '300', generations: '100' }]);
    console.info(
      JSON.stringify({
        acceptance: 'F7-19',
        sources: 100,
        chunks: 300,
        elapsedMs: performance.now() - started,
        extractorCalls: context.extractor.calls.length,
        documentEmbeddingCalls: context.embedder.calls.length,
        concurrency: 2,
        jobStartsPerMinute: 30,
      }),
    );
  });
});
