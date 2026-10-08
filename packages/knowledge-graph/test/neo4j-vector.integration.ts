import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';

import { Neo4jVectorStore } from '#knowledge-graph/neo4j-vector.client.js';

class TestEmbeddings extends Embeddings {
  constructor() {
    super({});
  }

  private vector(text: string): number[] {
    return text.includes('사과') ? [1, 0, 0] : [0, 1, 0];
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    return documents.map((document) => this.vector(document));
  }

  async embedQuery(query: string): Promise<number[]> {
    return this.vector(query);
  }
}

const neo4jConfig = {
  url: process.env.NEO4J_URI ?? '',
  username: process.env.NEO4J_USERNAME ?? '',
  password: process.env.NEO4J_PASSWORD ?? '',
};
const hasWritableDatabase =
  Boolean(neo4jConfig.url) &&
  Boolean(neo4jConfig.username) &&
  Boolean(neo4jConfig.password) &&
  process.env.KG_TEST_ALLOW_WRITE === '1';
const describeWhenWritable = hasWritableDatabase ? describe : describe.skip;

describeWhenWritable('실제 Neo4j 벡터 인덱스', () => {
  it('공식 VectorStore로 문서를 색인하고 유사 문서를 조회한다', async () => {
    const indexName = `kg_vector_integration_${Date.now()}_${process.pid}`;
    const nodeLabel = `KGVectorIntegrationTest_${process.pid}`;
    const store = await Neo4jVectorStore.fromDocuments(
      [
        new Document({
          pageContent: '사과를 먹는다.',
          metadata: { testScope: 'kg-vector', tenantId: 'org-a' },
        }),
        new Document({
          pageContent: '사과에 대한 두 번째 문서다.',
          metadata: { testScope: 'kg-vector', tenantId: 'org-b' },
        }),
        new Document({
          pageContent: '컴퓨터를 사용한다.',
          metadata: { testScope: 'kg-vector', tenantId: 'org-b' },
        }),
      ],
      new TestEmbeddings(),
      {
        ...neo4jConfig,
        indexName,
        nodeLabel,
        textNodeProperty: 'text',
        embeddingNodeProperty: 'embedding',
        preDeleteCollection: false,
      },
    );

    try {
      const results = await store.similaritySearch('사과', 1);
      expect(results).toHaveLength(1);
      expect(results[0].pageContent).toContain('사과');
      const scoped = await store.similaritySearch('사과', 1, {
        filter: { tenantId: 'org-a' },
      });
      expect(scoped).toHaveLength(1);
      expect(scoped[0].metadata.tenantId).toBe('org-a');
      const otherTenant = await store.similaritySearch('사과', 2, {
        filter: { tenantId: 'org-b' },
      });
      expect(otherTenant).toHaveLength(2);
      expect(
        otherTenant.every((document) => document.metadata.tenantId === 'org-b'),
      ).toBe(true);
    } finally {
      // 격리된 테스트 데이터만 정리한다. 데이터베이스 전체는 절대 삭제하지 않는다.
      await store.query(
        `MATCH (n:${nodeLabel}) WHERE n.testScope = $scope DETACH DELETE n`,
        {
          scope: 'kg-vector',
        },
      );
      await store.close();
    }
  });
});
