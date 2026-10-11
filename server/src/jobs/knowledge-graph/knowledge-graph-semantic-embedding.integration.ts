import { deriveSemanticIndexStatus } from '@/knowledge-graph/domain/semantic-index-status';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';
import { outboxSemanticSourceState as stateTable } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';

import { waitForCondition } from '@test/agent/support/teamspace-agent.e2e-support';
import { eq } from 'drizzle-orm';

jest.setTimeout(60_000);
describeKnowledgeGraph('실제 Jobs의 chunk별 embedding 완전성', () => {
  const context = createSemanticFlowContext();
  const vector = () => [1, ...Array.from({ length: 767 }, () => 0)];
  afterEach(() => jest.restoreAllMocks());
  it('F7-13 과거 embedding space는 stale이며 자동 재색인은 새 generation으로 전환하고 공간을 혼합하지 않는다', async () => {
    const source = await context.createWiki(
      'embedding 공간 전환',
      'embedding 공간이 달라도 같은 원본을 검증한다.',
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
    const previous = (await state.current(scope))?.state?.activeGenerationId;
    const oldSpace = 'c'.repeat(64);
    const past = new Date(Date.now() - 360_000);
    await context.database
      .update(wikiDocument)
      .set({ updatedAt: past })
      .where(eq(wikiDocument.id, source.id));
    await context.database
      .update(stateTable)
      .set({
        observedAt: past,
        indexedFingerprint: oldSpace,
        indexedSourceUpdatedAt: past,
      })
      .where(eq(stateTable.aggregateId, source.id));
    await context.graph.query(
      'MATCH (n) WHERE n.organizationId=$org AND n.generationId=$generation AND (n:KGSemanticChunk OR n:KGSemanticEntity) SET n.embeddingSpace=$space, n.sourceUpdatedAt=$updatedAt',
      {
        org: context.org,
        generation: previous,
        space: oldSpace,
        updatedAt: past.toISOString(),
      },
    );
    expect(
      deriveSemanticIndexStatus(
        await state.current(scope),
        past,
        semanticPipelineFingerprint,
      )?.status,
    ).toBe('stale');
    await context.app.get(SemanticJobQueueProvider).auto(scope, 0);
    await waitForCondition(
      async () => {
        const current = (await state.current(scope))?.state;
        return (
          current?.activeGenerationId !== previous &&
          current?.indexedFingerprint === semanticPipelineFingerprint
        );
      },
      '새 embedding 공간으로 활성화되지 않았습니다.',
      { timeoutMs: 15_000 },
    );
    const latest = await state.current(scope);
    expect(
      deriveSemanticIndexStatus(latest, past, semanticPipelineFingerprint)
        ?.status,
    ).toBe('up_to_date');
    expect(
      await context.graph.query(
        'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation AND c.embeddingSpace=$space RETURN count(c) AS mixed',
        {
          org: context.org,
          generation: latest?.state?.activeGenerationId,
          space: oldSpace,
        },
      ),
    ).toEqual([{ mixed: '0' }]);
    expect(
      context.extractor.calls.filter((text) => text === source.contentMarkdown),
    ).toHaveLength(2);
  });
  it.each(['count', 'dimension', 'nonfinite', 'zero'] as const)(
    'F7-13 실제7chunk는7vector로 활성화하고 %s 위반의 다음 세대는 이전 active를 보존한다',
    async (invalid) => {
      const text = Array.from(
        { length: 7 },
        (_, index) =>
          `## 정보${index}\n${'서로 다른 chunk의 의미 입력과 벡터 순서를 검증한다. '.repeat(50)}`,
      ).join('\n\n');
      const created = await context.createWiki(
        `일곱 embedding ${invalid}`,
        text,
      );
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
      const before = await state.current(scope);
      const active = before?.state?.activeGenerationId;
      expect(active).toBeTruthy();
      expect(
        await context.graph.query(
          'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation RETURN count(c) AS chunks, collect(size(c.embedding)) AS dimensions',
          { org: context.org, generation: active },
        ),
      ).toEqual([
        { chunks: '7', dimensions: Array.from({ length: 7 }, () => '768') },
      ]);
      jest
        .spyOn(context.embedder, 'embedDocuments')
        .mockImplementation(async (texts) => {
          expect(texts).toHaveLength(7);
          return Array.from({ length: invalid === 'count' ? 6 : 7 }, () =>
            invalid === 'dimension'
              ? vector().slice(1)
              : invalid === 'nonfinite'
                ? [Number.NaN, ...vector().slice(1)]
                : invalid === 'zero'
                  ? Array.from({ length: 768 }, () => 0)
                  : vector(),
          );
        });
      await context.refresh.requestManualRefresh(
        context.org,
        created.id,
        context.actor,
      );
      await waitForCondition(
        async () =>
          (await state.current(scope))?.state?.runStatus ===
          'validation_failed',
        '불완전한 embedding이 PG에서 종결되지 않았습니다.',
      );
      const failed = await state.current(scope);
      expect(failed?.state).toMatchObject({
        activeGenerationId: active,
        indexedManualSeq: 1,
        manualRequestSeq: 2,
        lastErrorCode: 'EMBEDDING_INVALID',
        indexedFingerprint: semanticPipelineFingerprint,
      });
      expect(
        deriveSemanticIndexStatus(
          failed,
          created.updatedAt,
          semanticPipelineFingerprint,
        )?.status,
      ).toBe('failed');
      expect(
        await context.graph.query(
          'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.sourceId=$source RETURN count(c) AS chunks, count(DISTINCT c.generationId) AS generations',
          { org: context.org, source: created.id },
        ),
      ).toEqual([{ chunks: '7', generations: '1' }]);
    },
  );
});
