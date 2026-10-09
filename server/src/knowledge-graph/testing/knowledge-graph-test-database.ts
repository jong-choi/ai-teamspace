// 지식 그래프 통합·E2E가 쓰는 단일 검증 DB. 개발 DB에 쓰지 않도록 이름으로 고정한다.
export const KNOWLEDGE_GRAPH_TEST_DATABASE = 'graph_kg_test';

// 실제 PostgreSQL·Neo4j·Redis에 쓰는 시험이므로 모든 연결이 로컬 검증 인스턴스여야 한다.
const REQUIRED_LOCAL_URLS = [
  'DATABASE_URL',
  'NEO4J_URI',
  'REDIS_QUEUE_URL',
  'REDIS_CACHE_URL',
  'REDIS_COLLABORATION_URL',
] as const;
const REQUIRED_VALUES = ['NEO4J_USERNAME', 'NEO4J_PASSWORD'] as const;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function assertKnowledgeGraphTestEnvironment(): void {
  const problems: string[] = [];
  for (const key of REQUIRED_LOCAL_URLS) {
    const value = process.env[key];
    if (!value) {
      problems.push(`${key} 없음`);
      continue;
    }
    if (!LOCAL_HOSTS.has(new URL(value).hostname))
      problems.push(`${key}가 로컬 검증 인스턴스가 아님`);
  }
  for (const key of REQUIRED_VALUES)
    if (!process.env[key]) problems.push(`${key} 없음`);
  const database = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).pathname.slice(1)
    : null;
  if (database !== KNOWLEDGE_GRAPH_TEST_DATABASE)
    problems.push(`DATABASE_URL이 ${KNOWLEDGE_GRAPH_TEST_DATABASE}가 아님`);
  if (problems.length)
    throw new Error(
      `KG_TEST_ALLOW_WRITE=1인데 지식 그래프 검증 환경이 맞지 않습니다: ${problems.join(', ')}`,
    );
}
