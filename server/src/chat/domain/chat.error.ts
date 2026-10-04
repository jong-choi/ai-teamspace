import { ApplicationError } from '#server/application.error.js';

export class ChatConversationNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CHAT_CONVERSATION_NOT_FOUND',
      'not_found',
      '대화를 찾을 수 없습니다.',
      options,
    );
  }
}

export class ChatMessageNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CHAT_MESSAGE_NOT_FOUND',
      'not_found',
      '메시지를 찾을 수 없습니다.',
      options,
    );
  }
}

export class ChatAccessDeniedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CHAT_ACCESS_DENIED',
      'forbidden',
      '이 채팅 작업을 수행할 권한이 없습니다.',
      options,
    );
  }
}

export class ChatInvalidCursorError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CHAT_INVALID_CURSOR',
      'bad_request',
      '유효하지 않은 메시지 커서입니다.',
      options,
    );
  }
}

export class ChatDirectConversationConflictError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CHAT_DIRECT_CONVERSATION_CONFLICT',
      'conflict',
      '직접 대화를 생성할 수 없습니다.',
      options,
    );
  }
}

export class ChatParticipantUnavailableError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CHAT_PARTICIPANT_UNAVAILABLE',
      'bad_request',
      '채팅 참여자를 추가할 수 없습니다.',
      options,
    );
  }
}
