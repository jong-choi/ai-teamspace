import { Neo4jVectorStore } from '@repo/knowledge-graph';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';

jest.setTimeout(60_000);

describeKnowledgeGraph(
  '실제 vector 부분 저장 실패의 활성 세대·orphan 처리',
  () => {
    const context = createSemanticFlowContext();
    afterEach(() => jest.restoreAllMocks());
    it('N7-06·F7-14 vector commit 뒤 실패해도 이전 active를 보존하고 자기 orphan만 정리한다', async () => {
      const source = await context.createWiki(
        '부분 vector 저장',
        '부분 저장 실패에서 이전 원본을 보존한다.',
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
      const active = (await state.current(scope))?.state?.activeGenerationId;
      await context.queue.pause();
      let writes = 0;
      const add = Neo4jVectorStore.prototype.addVectors;
      jest
        .spyOn(Neo4jVectorStore.prototype, 'addVectors')
        .mockImplementation(async function (
          this: Neo4jVectorStore,
          vectors,
          docs,
          metadata,
          ids,
        ) {
          const result = await add.call(this, vectors, docs, metadata, ids);
          if (metadata?.some((row) => row.sourceId === source.id)) {
            writes++;
            throw new Error('실제 vector 저장 뒤 장애');
          }
          return result;
        });
      const requested = await context.refresh.requestManualRefresh(
        context.org,
        source.id,
        context.actor,
      );
      if (requested.outcome !== 'accepted')
        throw new Error('수동 요청이 없습니다.');
      const id = `kg-semantic-manual-${requested.requestId}`;
      await waitForCondition(
        async () => Boolean(await context.queue.getJob(id)),
        '수동 job 접수가 없습니다.',
      );
      const pending = await context.queue.getJob(id);
      if (!pending) throw new Error('수동 job이 없습니다.');
      const data = pending.data;
      const name = pending.name;
      await pending.remove();
      await context.queue.add(name, data, {
        ...pending.opts,
        jobId: id,
        attempts: 4,
        backoff: { type: 'exponential', delay: 1 },
      });
      await context.queue.resume();
      await waitForCondition(
        async () =>
          (await context.queue.getJob(id))
            ?.getState()
            .then((status) => status === 'failed') ?? false,
        '부분 저장 실패의4회 시도가 종결되지 않았습니다.',
        { timeoutMs: 30_000 },
      );
      expect(writes).toBe(4);
      expect((await state.current(scope))?.state).toMatchObject({
        activeGenerationId: active,
        indexedManualSeq: 1,
        manualRequestSeq: 2,
        runStatus: 'failed',
        lastErrorCode: 'GRAPH_STORE_UNAVAILABLE',
      });
      expect(
        await context.graph.query(
          'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.sourceId=$source RETURN count(c) AS chunks, collect(c.generationId) AS generations',
          { org: context.org, source: source.id },
        ),
      ).toEqual([{ chunks: '1', generations: [active] }]);
    });
  },
);
