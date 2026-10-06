import { z } from 'zod';

export const CALENDAR_REMINDER_QUEUE = 'calendar-reminders';
export const CALENDAR_REMINDER_JOB = 'calendar-meeting-reminder';

export const CalendarReminderJobSchema = z.object({
  organizationId: z.string().min(1),
  meetingId: z.string().uuid(),
  startAt: z.string().datetime(),
});

export type CalendarReminderJob = z.infer<typeof CalendarReminderJobSchema>;

export function calendarReminderJobId(meetingId: string): string {
  return `calendar-reminder-${meetingId}`;
}
