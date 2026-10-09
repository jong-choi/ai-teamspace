import { ApplicationError } from '@/application.error';

export class KnowledgeGraphQueryDisabledError extends ApplicationError {
  constructor() {
    super(
      'KG_QUERY_DISABLED',
      'unavailable',
      '지식 그래프 조회가 비활성화되어 있습니다.',
    );
  }
}

export class KnowledgeGraphUnavailableError extends ApplicationError {
  constructor() {
    super(
      'KG_GRAPH_UNAVAILABLE',
      'unavailable',
      '지식 그래프를 조회할 수 없습니다.',
    );
  }
}

export class KnowledgeGraphNodeNotFoundError extends ApplicationError {
  constructor() {
    super(
      'KG_NODE_NOT_FOUND',
      'not_found',
      '지식 그래프 노드를 찾을 수 없습니다.',
    );
  }
}

export class KnowledgeGraphEdgeNotFoundError extends ApplicationError {
  constructor() {
    super(
      'KG_EDGE_NOT_FOUND',
      'not_found',
      '지식 그래프 관계를 찾을 수 없습니다.',
    );
  }
}

export class KnowledgeGraphViewChangedError extends ApplicationError {
  constructor() {
    super(
      'KG_GRAPH_VIEW_CHANGED',
      'conflict',
      '지식 그래프 조회 기준이 변경되었습니다.',
    );
  }
}

export class KnowledgeGraphCursorScopeMismatchError extends ApplicationError {
  constructor() {
    super(
      'KG_CURSOR_SCOPE_MISMATCH',
      'bad_request',
      '지식 그래프 cursor의 조회 범위가 일치하지 않습니다.',
    );
  }
}

export function assertKnowledgeGraphQueryEnabled(config: {
  query?: { enabled: boolean };
}): void {
  if (!config.query?.enabled) throw new KnowledgeGraphQueryDisabledError();
}
