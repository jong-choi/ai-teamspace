import { SemanticGraphStore } from '@/knowledge-graph/infrastructure/graph/semantic-graph-store.provider';
import { SemanticIngestionService } from '@/knowledge-graph/semantic-ingestion.service';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';
import { outboxSemanticSourceState as stateTable } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { eq } from 'drizzle-orm';

jest.setTimeout(60_000);
describeKnowledgeGraph(
  '실제 의미 GC 실패와 lease takeover 뒤 최신 세대 보존',
  () => {
    const context = createSemanticFlowContext();
    afterEach(() => jest.restoreAllMocks());
    it('F7-14·N7-04 GC 실패는 active를 보존하고 오래된 GC의 keep도 새 worker 세대를 삭제하거나 gcRequired를 지우지 못한다', async () => {
      const source = await context.createWiki(
        'GC 경합 검증',
        'GC 경합에서도 현재 원본을 보존한다.',
      );
      const scope = {
        organizationId: context.org,
        aggregateKind: 'wiki_document',
        aggregateId: source.id,
      } as const;
      const state = context.app.get(OutboxSemanticSourceState);
      const core = context.app.get(SemanticIngestionService);
      const graph = context.app.get(SemanticGraphStore);
      await context.refresh.requestManualRefresh(
        context.org,
        source.id,
        context.actor,
      );
      await context.indexed(source.id, 1);
      const previous = (await state.current(scope))?.state?.activeGenerationId;
      await context.refresh.requestManualRefresh(
        context.org,
        source.id,
        context.actor,
      );
      await context.indexed(source.id, 2);
      const active = (await state.current(scope))?.state?.activeGenerationId;
      expect(active).not.toBe(previous);
      const past = new Date(Date.now() - 660_000);
      await context.graph.query(
        'MATCH (n) WHERE n.organizationId=$org AND n.sourceId=$source AND n.generationId=$generation AND (n:KGSemanticChunk OR n:KGSemanticEntity) SET n.createdAt=$createdAt',
        {
          org: context.org,
          source: source.id,
          generation: previous,
          createdAt: past.toISOString(),
        },
      );
      await context.database
        .update(stateTable)
        .set({ gcRequired: true, lastIndexedAt: past })
        .where(eq(stateTable.aggregateId, source.id));
      const collecting = graph.deleteInactiveGenerations.bind(graph);
      const failure = jest
        .spyOn(graph, 'deleteInactiveGenerations')
        .mockRejectedValueOnce(new Error('GC 장애 주입'));
      await core.run(scope, false, new AbortController().signal);
      expect((await state.current(scope))?.state).toMatchObject({
        activeGenerationId: active,
        runStatus: 'idle',
        gcRequired: true,
      });
      failure.mockRestore();
      const concurrent = jest
        .spyOn(graph, 'deleteInactiveGenerations')
        .mockImplementationOnce(async (requestedScope, keep, cutoff) => {
          expect(keep).toBe(active);
          // GC lease가 만료된 뒤 다른 worker가 새 수동 요구를 처리하는 순서를 강제한다.
          await context.database
            .update(stateTable)
            .set({ leaseExpiresAt: new Date(0) })
            .where(eq(stateTable.aggregateId, source.id));
          await context.refresh.requestManualRefresh(
            context.org,
            source.id,
            context.actor,
          );
          await context.indexed(source.id, 3);
          const newest = (await state.current(scope))?.state
            ?.activeGenerationId;
          expect(newest).not.toBe(active);
          const finished = await collecting(requestedScope, keep, cutoff);
          expect(
            await context.graph.query(
              'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation RETURN count(c) AS kept',
              { org: context.org, generation: newest },
            ),
          ).toEqual([{ kept: '1' }]);
          return finished;
        });
      await core.run(scope, false, new AbortController().signal);
      expect(concurrent).toHaveBeenCalledTimes(1);
      const latest = await state.current(scope);
      expect(latest?.state).toMatchObject({
        indexedManualSeq: 3,
        manualRequestSeq: 3,
        runStatus: 'idle',
        gcRequired: true,
      });
      expect(latest?.state?.activeGenerationId).not.toBe(active);
      expect(
        await context.graph.query(
          'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation RETURN count(c) AS orphan',
          { org: context.org, generation: previous },
        ),
      ).toEqual([{ orphan: '0' }]);
      expect(
        context.extractor.calls.filter(
          (text) => text === source.contentMarkdown,
        ),
      ).toHaveLength(3);
    });
  },
);
