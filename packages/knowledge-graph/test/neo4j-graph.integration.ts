import { Document } from '@langchain/core/documents';
import {
  GraphDocument,
  Neo4jGraph,
  Node,
  Relationship,
} from '@langchain/neo4j';

import { createNeo4jGraph } from '#knowledge-graph/neo4j-graph.client.js';

const neo4jConfig = {
  url: process.env.NEO4J_URI ?? '',
  username: process.env.NEO4J_USERNAME ?? '',
  password: process.env.NEO4J_PASSWORD ?? '',
};
const isConfigured =
  Boolean(neo4jConfig.url) &&
  Boolean(neo4jConfig.username) &&
  Boolean(neo4jConfig.password);
const describeWhenConfigured = isConfigured ? describe : describe.skip;
const describeWhenWritable =
  isConfigured && process.env.KG_TEST_ALLOW_WRITE === '1'
    ? describe
    : describe.skip;

describeWhenConfigured('실제 Neo4j Community 연결', () => {
  it('매개변수화된 읽기 쿼리를 수행하고 연결을 종료한다', async () => {
    const graph = await createNeo4jGraph(neo4jConfig);
    try {
      const result = await graph.query('RETURN $value AS value', {
        value: '한국어-테스트',
      });
      expect(result).toEqual([{ value: '한국어-테스트' }]);
    } finally {
      await graph.close();
    }
  });
});

describeWhenWritable('실제 Neo4j GraphDocument 저장', () => {
  it('공식 API로 노드·관계·원문 출처를 저장한다', async () => {
    const graph = await Neo4jGraph.initialize(neo4jConfig);
    const id = `kg-integration-${Date.now()}-${process.pid}`;
    const docId = `kg-source-${id}`;
    const actor = new Node({
      id,
      type: 'KGTestActor',
      properties: { name: '민수' },
    });
    const technology = new Node({
      id: `${id}-tech`,
      type: 'KGTestTechnology',
      properties: { name: 'Neo4j' },
    });
    const graphDocument = new GraphDocument({
      source: new Document({
        pageContent: '민수는 Neo4j를 사용한다.',
        metadata: { id: docId },
      }),
      nodes: [actor, technology],
      relationships: [
        new Relationship({
          source: actor,
          target: technology,
          type: 'KG_TEST_USES',
        }),
      ],
    });

    try {
      await graph.addGraphDocuments([graphDocument], {
        includeSource: true,
        baseEntityLabel: true,
      });
      const rows = await graph.query(
        'MATCH (a:KGTestActor {id: $id})-[r:KG_TEST_USES]->(t:KGTestTechnology) RETURN a.name AS actor, t.name AS technology',
        { id },
      );
      expect(rows).toEqual([{ actor: '민수', technology: 'Neo4j' }]);
      const sources = await graph.query(
        'MATCH (d:Document {id: $sourceId}) RETURN d.id AS id',
        { sourceId: docId },
      );
      expect(sources).toHaveLength(1);
    } finally {
      // 테스트로 만든 식별자에만 제한하여 삭제한다.
      await graph.query('MATCH (n) WHERE n.id IN $ids DETACH DELETE n', {
        ids: [id, `${id}-tech`, docId],
      });
      await graph.close();
    }
  });
  it('출처가 달라도 동일 노드 ID는 합쳐지는 위험을 재현한다', async () => {
    const graph = await Neo4jGraph.initialize(neo4jConfig);
    const id = `kg-collision-${Date.now()}-${process.pid}`;
    const sourceIds = [`${id}-organization-a`, `${id}-organization-b`];
    try {
      for (const sourceId of sourceIds) {
        await graph.addGraphDocuments(
          [
            new GraphDocument({
              source: new Document({
                pageContent: '각 조직에 같은 이름이 있다.',
                metadata: { id: sourceId },
              }),
              nodes: [new Node({ id, type: 'KGTestCollision' })],
              relationships: [],
            }),
          ],
          { includeSource: true, baseEntityLabel: true },
        );
      }
      const nodes = await graph.query(
        'MATCH (n:KGTestCollision {id: $id}) RETURN count(n) AS total',
        { id },
      );
      expect(String(nodes[0].total)).toBe('1');
    } finally {
      // 출처와 엔티티 ID만 삭제하고 다른 데이터를 건드리지 않는다.
      await graph.query('MATCH (n) WHERE n.id IN $ids DETACH DELETE n', {
        ids: [id, ...sourceIds],
      });
      await graph.close();
    }
  });
});
