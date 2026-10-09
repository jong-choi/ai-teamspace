import { ApplicationError } from '@/application.error';

export class KnowledgeGraphRebuildForbiddenError extends ApplicationError {
  constructor() {
    super(
      'KG_REBUILD_FORBIDDEN',
      'forbidden',
      '조직 지식 그래프를 재구축할 권한이 없습니다.',
    );
  }
}

export class KnowledgeGraphRebuildNotFoundError extends ApplicationError {
  constructor() {
    super(
      'KG_REBUILD_NOT_FOUND',
      'not_found',
      '지식 그래프 재구축 요청을 찾을 수 없습니다.',
    );
  }
}

export class KnowledgeGraphRebuildNotCancellableError extends ApplicationError {
  constructor() {
    super(
      'KG_REBUILD_NOT_CANCELLABLE',
      'conflict',
      '이 지식 그래프 재구축 요청은 취소할 수 없습니다.',
    );
  }
}
