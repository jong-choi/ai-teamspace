# @repo/knowledge-graph

Neo4j 공식 LangChain JS 통합과 MIT 라이선스 `LLMGraphTransformer` 이식본을 제공하는 NodeNext ESM 패키지.

## 공개 API

- `createNeo4jGraph(config)`: 공식 `Neo4jGraph.initialize()` 호출. 사용 후 반드시 `await graph.close()` 수행
- `Neo4jGraph`, `GraphDocument`, `Node`, `Relationship`: `@langchain/neo4j` 공식 모델 재노출
- `LLMGraphTransformer`: LangChain JS Community의 MIT 원본 추출기를 타입·ESM·코드 스타일에 맞춰 이식
- `Neo4jVectorStore`: 공식 벡터 저장소를 별도 알고리즘 없이 재노출

`@langchain/community` 패키지는 설치하지 않는다. LLM·Embeddings 구현과 연결 자격 증명은 호출자가 주입한다.

## 사용 흐름

```ts
const graph = await createNeo4jGraph(neo4jConfig);
try {
  const transformer = new LLMGraphTransformer({
    llm,
    allowedNodes: ['Person', 'Technology'],
    allowedRelationships: ['USES'],
    strictMode: true,
  });
  const documents = await transformer.convertToGraphDocuments(sourceDocuments);
  await graph.addGraphDocuments(documents, { includeSource: true });
} finally {
  await graph.close();
}
```

`llm`, `neo4jConfig`, `sourceDocuments`는 호출자가 제공한다. 위 코드는 API 사용 형태를 보여주며, 조직 식별자·권한·동기화 정책을 구현하지 않는다.

벡터 스토어는 공식 `Neo4jVectorStore.fromDocuments()` / `fromExistingIndex()` 및 `similaritySearch()`를 사용한다. 조직별 검색은 **호출자가 필터를 반드시 전달하고 권한을 확인**해야 한다.

```ts
const results = await vectorStore.similaritySearch(query, 5, {
  filter: { organizationId },
});
```

## 중요한 제약

- 공식 `Neo4jGraph.initialize()`는 초기화 때 schema refresh를 수행한다. Neo4j Community와 APOC 구성을 실제 환경에서 검증해야 한다.
- `includeSource: true`만으로 tenant별 노드가 격리되지는 않는다. 같은 `Node.id`/label이 서로 다른 출처에서 **병합되는 현상**을 통합 테스트에서 재현했다. 조직/출처별 ID namespace와 권한 정책은 상위 서버 책임이다.
- `Neo4jVectorStore`의 메타데이터 필터는 실제 Neo4j Community 2025.09 환경에서 확인했으나, 필터 없는 검색은 전역 데이터를 대상으로 할 수 있다. 패키지는 인증·권한을 강제하지 않는다.
- LLM은 구조화 출력 지원 모델이어야 한다. 실제 Gemini API 연동 및 추출 품질은 API 키·비용이 수반되어 별도 검증이 필요하다.
- 원본 라이브러리와 분리하여 관리하는 만큼, upstream 보안 수정과 타입 호환성은 지속적으로 추적해야 한다.

## 검증

패키지 디렉터리에서 다음 스크립트를 실행한다.

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

실제 DB 통합 검증은 **전용·격리된 Neo4j Community 테스트 DB**에서만 진행한다. `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`를 설정하고 쓰기 테스트를 명시적으로 허용할 때만 실행한다.

```sh
KG_TEST_ALLOW_WRITE=1 npm run test:integration
```

쓰기 허용 값이 없으면 노드/벡터 저장 테스트는 건너뛴다. 로컬 검증에는 Neo4j 2025.09 Community와 APOC 플러그인을 사용했다.

의존성 설치는 **루트 npm workspace의 lockfile과 동기화**되어야 한다. 다른 작업자의 작업 범위를 보호하기 위해 이 패키지 구현에서는 루트 `package-lock.json`을 수정하지 않았으므로, 전체 모노레포 통합 전에 루트 lockfile 갱신이 별도로 필요하다.

## 라이선스

원본 커밋·수정 범위·MIT 라이선스 원문은 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)에 보존했다.
