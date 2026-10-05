import { ApplicationError } from '#server/application.error.js';

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

export class CalendarProjectIntegrationUnavailableError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'CALENDAR_PROJECT_INTEGRATION_UNAVAILABLE',
      'bad_request',
      '현재 서버에는 Project 참조 기능이 연결되어 있지 않습니다.',
      options,
    );
  }
}
