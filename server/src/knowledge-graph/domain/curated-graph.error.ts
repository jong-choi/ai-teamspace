export class CuratedGraphRevisionConflictError extends Error {
  constructor() {
    super('지식 그래프 편집 revision이 현재 원본과 일치하지 않습니다.');
  }
}

export class CuratedGraphNodeConnectedError extends Error {
  constructor(readonly connectedEdgeCount: number) {
    super('연결된 활성 edge가 있는 curated node는 삭제할 수 없습니다.');
  }
}

export class CuratedGraphEndpointInvalidError extends Error {
  constructor() {
    super('관계의 양끝은 허용된 종류와 같은 조직의 현재 원본이어야 합니다.');
  }
}

export class CuratedGraphWriteForbiddenError extends Error {
  constructor() {
    super(
      '사용자 작성 그래프는 현재 조직 소유자 또는 관리자만 수정할 수 있습니다.',
    );
  }
}

export class CuratedGraphEdgeDuplicateError extends Error {
  constructor() {
    super('같은 종단·종류·방향의 활성 사용자 관계가 이미 있습니다.');
  }
}
