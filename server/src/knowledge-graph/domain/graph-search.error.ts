export type KnowledgeGraphSemanticSearchUnavailableReason =
  'KG_GRAPH_UNAVAILABLE' | 'KG_VECTOR_INDEX_NOT_READY';

export class KnowledgeGraphSemanticSearchUnavailableError extends Error {
  constructor(readonly reason: KnowledgeGraphSemanticSearchUnavailableReason) {
    super('지식 그래프 의미 검색을 지금 사용할 수 없습니다.');
    this.name = 'KnowledgeGraphSemanticSearchUnavailableError';
  }
}
