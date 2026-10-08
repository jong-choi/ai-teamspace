import { Document } from '@langchain/core/documents';
import { RunnableLambda } from '@langchain/core/runnables';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { Neo4jGraph } from '@langchain/neo4j';

import { LLMGraphTransformer } from '#knowledge-graph/llm-graph-transformer.js';

const config = {
  url: process.env.NEO4J_URI ?? '',
  username: process.env.NEO4J_USERNAME ?? '',
  password: process.env.NEO4J_PASSWORD ?? '',
};
const enabled =
  Boolean(config.url && config.username && config.password) &&
  process.env.KG_TEST_ALLOW_WRITE === '1';

(enabled ? describe : describe.skip)(
  'LLM 그래프 추출부터 Neo4j 저장까지',
  () => {
    it('MIT 추출기 출력이 공식 Neo4jGraph에 저장되고 조회된다', async () => {
      const id = `kg-llm-${Date.now()}-${process.pid}`;
      const sourceId = `kg-llm-source-${id}`;
      const model = new FakeListChatModel({ responses: ['모의 모델 응답'] });
      Object.defineProperty(model, 'withStructuredOutput', {
        value: () =>
          RunnableLambda.from(async () => ({
            nodes: [
              {
                id,
                type: 'Person',
                properties: [{ key: 'name', value: '민수' }],
              },
              { id: `${id}-technology`, type: 'Technology' },
            ],
            relationships: [
              {
                sourceNodeId: id,
                sourceNodeType: 'Person',
                targetNodeId: `${id}-technology`,
                targetNodeType: 'Technology',
                relationshipType: 'USES',
              },
            ],
          })),
      });
      const transformer = new LLMGraphTransformer({
        llm: model,
        allowedNodes: ['Person', 'Technology'],
        allowedRelationships: ['USES'],
        nodeProperties: ['name'],
      });
      const documents = await transformer.convertToGraphDocuments([
        new Document({
          pageContent: '민수는 Neo4j를 사용한다.',
          metadata: { id: sourceId },
        }),
      ]);
      expect(documents).toHaveLength(1);

      const graph = await Neo4jGraph.initialize(config);
      try {
        await graph.addGraphDocuments(documents, {
          includeSource: true,
          baseEntityLabel: true,
        });
        const nodes = await graph.query(
          'MATCH (p:Person {id: $id})-[r:USES]->(t:Technology) RETURN p.name AS name, t.id AS technology',
          { id },
        );
        expect(nodes).toEqual([
          { name: '민수', technology: `${id}-technology` },
        ]);
      } finally {
        // 이번 테스트가 생성한 ID만 삭제한다.
        await graph.query('MATCH (n) WHERE n.id IN $ids DETACH DELETE n', {
          ids: [id, `${id}-technology`, sourceId],
        });
        await graph.close();
      }
    });
  },
);
