import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

jest.setTimeout(60_000);

describeKnowledgeGraph('실제 PG commit 뒤 활성화 응답 유실과 세대 보존', () => {
  const context = createSemanticFlowContext();
  afterEach(() => jest.restoreAllMocks());
  it('F7-14 활성화 응답이 유실돼도 PG에서 승인한 실제 Neo4j chunk·entity를 지우지 않는다', async () => {
    const source = await context.createWiki(
      'PG 응답 유실',
      '지윤은 활성화 응답 유실을 검증한다.',
    );
    const state = context.app.get(OutboxSemanticSourceState);
    const activate = state.activate.bind(state);
    const committed = jest
      .spyOn(state, 'activate')
      .mockImplementationOnce(async (...args) => {
        const result = await activate(...args);
        if (result.outcome !== 'activated')
          throw new Error('실제 PG 활성화가 거부됐습니다.');
        throw new Error('활성화 PG commit 응답 유실');
      });
    await context.refresh.requestManualRefresh(
      context.org,
      source.id,
      context.actor,
    );
    await context.indexed(source.id, 1);
    expect(committed.mock.calls.length).toBe(1);
    const current = await state.current({
      organizationId: context.org,
      aggregateKind: 'wiki_document',
      aggregateId: source.id,
    });
    expect(current?.state).toMatchObject({
      runStatus: 'idle',
      lastErrorCode: null,
      indexedSeq: 1,
      indexedManualSeq: 1,
    });
    expect(
      await context.graph.query(
        'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation OPTIONAL MATCH (c)-[:KG_SEMANTIC_MENTIONS]->(e:KGSemanticEntity) RETURN count(DISTINCT c) AS chunks, count(e) AS entities',
        { org: context.org, generation: current?.state?.activeGenerationId },
      ),
    ).toEqual([{ chunks: '1', entities: '2' }]);
  });
});
