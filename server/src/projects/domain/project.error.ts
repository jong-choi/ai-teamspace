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
