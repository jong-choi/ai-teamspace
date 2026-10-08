import { Neo4jVectorStore as OfficialNeo4jVectorStore } from '@langchain/neo4j';

import { Neo4jVectorStore } from '#knowledge-graph/neo4j-vector.client.js';

describe('공식 Neo4j 벡터 저장소', () => {
  it('별도 재구현 없이 동일한 공식 클래스를 공개한다', () => {
    expect(Neo4jVectorStore).toBe(OfficialNeo4jVectorStore);
  });
});
