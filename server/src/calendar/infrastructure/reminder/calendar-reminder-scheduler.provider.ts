import type { Meeting } from '#server/calendar/domain/meeting.js';

export abstract class CalendarReminderScheduler {
  abstract sync(meetings: readonly Meeting[]): Promise<void>;
  abstract cancel(meetingIds: readonly string[]): Promise<void>;
}
