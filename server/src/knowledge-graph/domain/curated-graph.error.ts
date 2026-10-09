import { ApplicationError } from '@/application.error';

export class CuratedGraphRevisionConflictError extends ApplicationError {
  constructor() {
    super(
      'KG_CURATED_REVISION_CONFLICT',
      'conflict',
      '지식 그래프 편집 revision이 현재 원본과 일치하지 않습니다.',
    );
  }
}

export class CuratedGraphNodeConnectedError extends ApplicationError {
  constructor(readonly connectedEdgeCount: number) {
    super(
      'KG_CURATED_NODE_CONNECTED',
      'conflict',
      '연결된 활성 edge가 있는 curated node는 삭제할 수 없습니다.',
    );
  }
}

export class CuratedGraphEndpointInvalidError extends ApplicationError {
  constructor() {
    super(
      'KG_CURATED_ENDPOINT_INVALID',
      'bad_request',
      '관계의 양끝은 허용된 종류와 같은 조직의 현재 원본이어야 합니다.',
    );
  }
}

export class CuratedGraphWriteForbiddenError extends ApplicationError {
  constructor() {
    super(
      'KG_CURATED_WRITE_FORBIDDEN',
      'forbidden',
      '사용자 작성 그래프는 현재 조직 소유자 또는 관리자만 수정할 수 있습니다.',
    );
  }
}

export class CuratedGraphEdgeDuplicateError extends ApplicationError {
  constructor() {
    super(
      'KG_CURATED_EDGE_DUPLICATE',
      'conflict',
      '같은 종단·종류·방향의 활성 사용자 관계가 이미 있습니다.',
    );
  }
}
