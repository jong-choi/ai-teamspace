import { ApplicationError } from '#server/application.error.js';

export class ProjectNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'PROJECT_NOT_FOUND',
      'not_found',
      '프로젝트를 찾을 수 없습니다.',
      options,
    );
  }
}

export class ProjectColumnNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'PROJECT_COLUMN_NOT_FOUND',
      'not_found',
      '프로젝트 컬럼을 찾을 수 없습니다.',
      options,
    );
  }
}

export class TicketNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super('TICKET_NOT_FOUND', 'not_found', '티켓을 찾을 수 없습니다.', options);
  }
}

export class TicketArchivedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'TICKET_ARCHIVED',
      'conflict',
      '보관된 티켓에는 변경을 적용할 수 없습니다.',
      options,
    );
  }
}

export class ProjectKeyConflictError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'PROJECT_KEY_CONFLICT',
      'conflict',
      '같은 조직에서 이미 사용 중인 프로젝트 키입니다.',
      options,
    );
  }
}

export class ProjectUserNotMemberError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'PROJECT_USER_NOT_MEMBER',
      'bad_request',
      '프로젝트에 지정한 사용자가 현재 조직의 멤버가 아닙니다.',
      options,
    );
  }
}

export class ProjectArchivedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'PROJECT_ARCHIVED',
      'conflict',
      '보관된 프로젝트에는 변경을 적용할 수 없습니다.',
      options,
    );
  }
}

export class TicketMoveReferenceInvalidError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'TICKET_MOVE_REFERENCE_INVALID',
      'bad_request',
      '티켓 이동 기준이 대상 컬럼에 존재하지 않습니다.',
      options,
    );
  }
}

export class TicketLabelNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'TICKET_LABEL_NOT_FOUND',
      'not_found',
      '티켓 라벨을 찾을 수 없습니다.',
      options,
    );
  }
}

export class TicketChecklistNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'TICKET_CHECKLIST_NOT_FOUND',
      'not_found',
      '티켓 체크리스트를 찾을 수 없습니다.',
      options,
    );
  }
}

export class TicketChecklistItemNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'TICKET_CHECKLIST_ITEM_NOT_FOUND',
      'not_found',
      '티켓 체크리스트 항목을 찾을 수 없습니다.',
      options,
    );
  }
}

export class TicketChecklistMoveReferenceInvalidError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'TICKET_CHECKLIST_MOVE_REFERENCE_INVALID',
      'bad_request',
      '체크리스트 이동 기준 항목을 찾을 수 없습니다.',
      options,
    );
  }
}

export class TicketCommentNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'TICKET_COMMENT_NOT_FOUND',
      'not_found',
      '티켓 댓글을 찾을 수 없습니다.',
      options,
    );
  }
}

export class TicketCommentAuthorRequiredError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'TICKET_COMMENT_AUTHOR_REQUIRED',
      'forbidden',
      '댓글 작성자만 수정하거나 삭제할 수 있습니다.',
      options,
    );
  }
}
