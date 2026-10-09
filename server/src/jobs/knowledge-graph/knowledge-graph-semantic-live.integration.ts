import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

const enabled =
  process.env.KG_SEMANTIC_LIVE === 'true' &&
  Boolean(process.env.OLLAMA_API_KEY) &&
  Boolean(process.env.GEMINI_API_KEY);
const describeLive = enabled ? describeKnowledgeGraph : describe.skip;
if (!enabled)
  console.info('L7-03 skipped: 실제 공급자 opt-in 또는 공급자 키가 없습니다.');
describeLive('실제 공급자의 격리 Wiki 한 문서 Jobs 수락', () => {
  jest.setTimeout(240_000);
  const context = createSemanticFlowContext(true);
  it('L7-03 실제 Tool Calling과 Gemini embedding을 거친 generation만 PG CAS로 활성화한다', async () => {
    const source = await context.createWiki(
      '실제 공급자 의미 수락',
      '지윤은 Neo4j를 사용한다. 지윤은 그래프 프로젝트를 담당한다.',
    );
    const started = performance.now();
    await context.refresh.requestManualRefresh(
      context.org,
      source.id,
      context.actor,
    );
    await context.indexed(source.id, 1, 180_000);
    const current = await context.app.get(OutboxSemanticSourceState).current({
      organizationId: context.org,
      aggregateKind: 'wiki_document',
      aggregateId: source.id,
    });
    expect(current?.state?.activeGenerationId).toBeTruthy();
    expect(
      await context.graph.query(
        'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation RETURN count(c) AS chunks, size(head(collect(c.embedding))) AS dimension',
        { org: context.org, generation: current?.state?.activeGenerationId },
      ),
    ).toEqual([{ chunks: '1', dimension: '768' }]);
    console.info(
      JSON.stringify({
        acceptance: 'L7-03',
        sources: 1,
        elapsedMs: performance.now() - started,
      }),
    );
  });
});
