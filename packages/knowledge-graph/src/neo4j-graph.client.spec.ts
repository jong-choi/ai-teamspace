import { jest } from '@jest/globals';
import { Neo4jGraph } from '@langchain/neo4j';

import { createNeo4jGraph } from '#knowledge-graph/neo4j-graph.client.js';

describe('Neo4j 공식 클라이언트 생성', () => {
  afterEach(() => jest.restoreAllMocks());

  it('공식 초기화 오류를 숨기지 않고 전파한다', async () => {
    const failure = new Error('연결 거부');
    jest.spyOn(Neo4jGraph, 'initialize').mockRejectedValue(failure);
    const config = {
      url: 'bolt://localhost:7687',
      username: 'neo4j',
      password: '테스트용-비밀',
    };
    await expect(createNeo4jGraph(config)).rejects.toBe(failure);
    expect(Neo4jGraph.initialize).toHaveBeenCalledWith(config);
  });
});
