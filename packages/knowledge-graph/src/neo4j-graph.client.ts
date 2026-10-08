import { Neo4jGraph } from '@langchain/neo4j';

/** 서버별 독립적인 Neo4jGraph 인스턴스를 생성한다. */
export function createNeo4jGraph(
  config: Parameters<typeof Neo4jGraph.initialize>[0],
): ReturnType<typeof Neo4jGraph.initialize> {
  return Neo4jGraph.initialize(config);
}
