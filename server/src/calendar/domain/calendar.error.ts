import { ApplicationError } from '@/application.error';

export class CalendarMeetingNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_MEETING_NOT_FOUND',
      'not_found',
      '회의를 찾을 수 없습니다.',
      options,
    );
  }
}

export class CalendarMeetingRoomNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_MEETING_ROOM_NOT_FOUND',
      'not_found',
      '회의실을 찾을 수 없습니다.',
      options,
    );
  }
}

export class CalendarMeetingRoomInactiveError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_MEETING_ROOM_INACTIVE',
      'conflict',
      '비활성화된 회의실에는 새 회의를 예약할 수 없습니다.',
      options,
    );
  }
}

export class CalendarInvalidTimeRangeError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_INVALID_TIME_RANGE',
      'bad_request',
      '회의 종료 시각은 시작 시각보다 늦어야 합니다.',
      options,
    );
  }
}

export class CalendarInvalidLocationError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_INVALID_LOCATION',
      'bad_request',
      '회의 장소 설정이 locationType과 일치하지 않습니다.',
      options,
    );
  }
}

export class CalendarAttendeeNotMemberError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_ATTENDEE_NOT_MEMBER',
      'bad_request',
      '회의 참석자는 현재 조직의 멤버여야 합니다.',
      options,
    );
  }
}

export class CalendarProjectNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_PROJECT_NOT_FOUND',
      'bad_request',
      '현재 조직에서 참조할 수 있는 프로젝트를 찾을 수 없습니다.',
      options,
    );
  }
}

export class CalendarParticipantConflictError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_MEETING_PARTICIPANT_CONFLICT',
      'conflict',
      '주최자 또는 참석자의 기존 회의와 시간이 겹칩니다.',
      options,
    );
  }
}

export class CalendarRoomConflictError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_MEETING_ROOM_CONFLICT',
      'conflict',
      '회의실의 기존 예약과 시간이 겹칩니다.',
      options,
    );
  }
}

export class CalendarMeetingCanceledError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_MEETING_CANCELED',
      'conflict',
      '취소된 회의에는 이 작업을 수행할 수 없습니다.',
      options,
    );
  }
}

export class CalendarMeetingAlreadyCanceledError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_MEETING_ALREADY_CANCELED',
      'conflict',
      '이미 취소된 회의입니다.',
      options,
    );
  }
}

export class CalendarMeetingNotAttendeeError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_MEETING_NOT_ATTENDEE',
      'forbidden',
      '이 회의의 참석자만 RSVP를 변경할 수 있습니다.',
      options,
    );
  }
}

export class CalendarInvalidRecurrenceError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_INVALID_RECURRENCE',
      'bad_request',
      '반복 일정 규칙이 올바르지 않습니다.',
      options,
    );
  }
}

export class CalendarInvalidRecurrenceScopeError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_INVALID_RECURRENCE_SCOPE',
      'bad_request',
      '이 회의에는 요청한 반복 일정 범위를 적용할 수 없습니다.',
      options,
    );
  }
}

export class CalendarSchedulingContentionError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_SCHEDULING_CONTENTION',
      'conflict',
      '동시에 일정이 변경되어 요청을 완료하지 못했습니다. 다시 시도해 주세요.',
      options,
    );
  }
}

export class CalendarIcsGenerationError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_ICS_GENERATION_FAILED',
      'internal',
      'iCalendar 파일을 생성하지 못했습니다.',
      options,
    );
  }
}
