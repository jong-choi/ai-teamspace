import { ApplicationError } from '@/application.error';

export class KnowledgeGraphRateLimitedError extends ApplicationError {
  constructor(retryAfterSeconds: number) {
    super(
      'KG_RATE_LIMITED',
      'rate_limited',
      '지식 그래프 요청 한도를 초과했습니다.',
      { retryAfterSeconds },
    );
  }
}

export class KnowledgeGraphAuthorizationUnavailableError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'KG_AUTHORIZATION_UNAVAILABLE',
      'unavailable',
      '현재 지식 그래프 접근 권한을 확인할 수 없습니다.',
      options,
    );
  }
}

export class KnowledgeGraphWikiDocumentNotFoundError extends ApplicationError {
  constructor() {
    super(
      'KG_WIKI_DOCUMENT_NOT_FOUND',
      'not_found',
      '지식 그래프를 갱신할 위키 문서를 찾을 수 없습니다.',
    );
  }
}

export class KnowledgeGraphRefreshAcceptanceUnavailableError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'KG_REFRESH_ACCEPTANCE_UNAVAILABLE',
      'unavailable',
      '지식 그래프 갱신 요청을 지금 접수할 수 없습니다.',
      options,
    );
  }
}

export class KnowledgeGraphWikiRefreshForbiddenError extends ApplicationError {
  constructor() {
    super(
      'KG_WIKI_REFRESH_FORBIDDEN',
      'forbidden',
      '이 위키 문서의 지식 그래프를 갱신할 권한이 없습니다.',
    );
  }
}
