export class CuratedGraphRevisionConflictError extends Error {
  constructor() {
    super('지식 그래프 편집 revision이 현재 원본과 일치하지 않습니다.');
  }
}

export class CuratedGraphNodeConnectedError extends Error {
  constructor() {
    super('연결된 활성 edge가 있는 curated node는 삭제할 수 없습니다.');
  }
}

export class CuratedGraphEndpointInvalidError extends Error {
  constructor() {
    super('curated edge의 양끝은 같은 조직의 활성 curated node여야 합니다.');
  }
}
