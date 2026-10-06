import type { Meeting } from '@/calendar/domain/meeting';

export abstract class CalendarReminderScheduler {
  abstract sync(meetings: readonly Meeting[]): Promise<void>;
  abstract cancel(meetingIds: readonly string[]): Promise<void>;
}
