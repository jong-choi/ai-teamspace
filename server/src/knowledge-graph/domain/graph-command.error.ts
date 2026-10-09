import { ApplicationError } from '@/application.error';

export class KnowledgeGraphCorrectionTargetAmbiguousError extends ApplicationError {
  constructor() {
    super(
      'KG_CORRECTION_TARGET_AMBIGUOUS',
      'conflict',
      '의미 보정 대상을 하나로 확정할 수 없습니다.',
    );
  }
}

export class KnowledgeGraphCorrectionNotActiveError extends ApplicationError {
  constructor() {
    super(
      'KG_CORRECTION_NOT_ACTIVE',
      'conflict',
      '활성 상태의 의미 보정이 아닙니다.',
    );
  }
}

export class KnowledgeGraphCorrectionNotFoundError extends ApplicationError {
  constructor() {
    super(
      'KG_CORRECTION_NOT_FOUND',
      'not_found',
      '의미 보정을 찾을 수 없습니다.',
    );
  }
}

export class KnowledgeGraphCuratedNodeNotFoundError extends ApplicationError {
  constructor() {
    super(
      'KG_CURATED_NODE_NOT_FOUND',
      'not_found',
      '사용자 작성 그래프 노드를 찾을 수 없습니다.',
    );
  }
}

export class KnowledgeGraphCuratedEdgeNotFoundError extends ApplicationError {
  constructor() {
    super(
      'KG_CURATED_EDGE_NOT_FOUND',
      'not_found',
      '사용자 작성 그래프 관계를 찾을 수 없습니다.',
    );
  }
}
