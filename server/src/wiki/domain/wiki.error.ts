import { ApplicationError } from '#server/application.error.js';

export class WikiDocumentNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_DOCUMENT_NOT_FOUND',
      'not_found',
      '위키 문서를 찾을 수 없습니다.',
      options,
    );
  }
}

export class WikiDocumentRevisionNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_DOCUMENT_REVISION_NOT_FOUND',
      'not_found',
      '위키 문서 revision을 찾을 수 없습니다.',
      options,
    );
  }
}

export class WikiDocumentHistoryCorruptedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_DOCUMENT_HISTORY_CORRUPTED',
      'conflict',
      '위키 문서 history 무결성이 깨졌습니다.',
      options,
    );
  }
}

export class WikiDocumentNotEmptyError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_DOCUMENT_NOT_EMPTY',
      'conflict',
      '하위 문서가 있는 위키 문서는 삭제할 수 없습니다.',
      options,
    );
  }
}

export class WikiInvalidDocumentMoveError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_INVALID_DOCUMENT_MOVE',
      'conflict',
      '위키 문서를 자기 자신 또는 하위 문서로 이동할 수 없습니다.',
      options,
    );
  }
}

export class WikiCollaborationAccessDeniedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_COLLABORATION_ACCESS_DENIED',
      'forbidden',
      '이 위키 문서에 공동편집으로 접근할 권한이 없습니다.',
      options,
    );
  }
}

export class WikiCollaborationInvalidTokenError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_COLLABORATION_INVALID_TOKEN',
      'forbidden',
      '유효하지 않은 위키 공동편집 토큰입니다.',
      options,
    );
  }
}

export class WikiCollaborationInvalidDocumentNameError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_COLLABORATION_INVALID_DOCUMENT_NAME',
      'bad_request',
      '유효하지 않은 위키 공동편집 문서 이름입니다.',
      options,
    );
  }
}

export class WikiCollaborationProtocolVersionError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_COLLABORATION_PROTOCOL_VERSION_UNSUPPORTED',
      'bad_request',
      '지원하지 않는 위키 공동편집 프로토콜 버전입니다.',
      options,
    );
  }
}

export class WikiCollaborationStateCorruptedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_COLLABORATION_STATE_CORRUPTED',
      'conflict',
      '위키 공동편집 상태를 복원할 수 없습니다.',
      options,
    );
  }
}

export class WikiCollaborationStateTooLargeError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_COLLABORATION_STATE_TOO_LARGE',
      'bad_request',
      '위키 공동편집 상태가 허용된 크기를 초과했습니다.',
      options,
    );
  }
}

export class WikiCollaborationSchemaVersionError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_COLLABORATION_SCHEMA_VERSION_UNSUPPORTED',
      'conflict',
      '지원하지 않는 위키 공동편집 schema version입니다.',
      options,
    );
  }
}

export class WikiCollaborationPersistenceError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_COLLABORATION_PERSISTENCE_FAILED',
      'external_provider',
      '위키 공동편집 상태를 저장하지 못했습니다.',
      options,
    );
  }
}
