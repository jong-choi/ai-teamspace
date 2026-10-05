import { ApplicationError } from '#server/application.error.js';

export class WikiFolderNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_FOLDER_NOT_FOUND',
      'not_found',
      '위키 폴더를 찾을 수 없습니다.',
      options,
    );
  }
}

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

export class WikiFolderNotEmptyError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_FOLDER_NOT_EMPTY',
      'conflict',
      '하위 폴더 또는 문서가 있는 위키 폴더는 삭제할 수 없습니다.',
      options,
    );
  }
}

export class WikiInvalidFolderMoveError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'WIKI_INVALID_FOLDER_MOVE',
      'conflict',
      '위키 폴더를 자기 자신 또는 하위 폴더로 이동할 수 없습니다.',
      options,
    );
  }
}
