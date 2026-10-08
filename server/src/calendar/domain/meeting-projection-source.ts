import { meetingSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.zod';
import { meetingAttendeeSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.zod';
import { meetingRecurrenceSeriesSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.zod';
import { meetingRoomSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.zod';

import type { z } from 'zod';

export const MeetingProjectionSourceSchema = meetingSelectSchema
  .pick({
    id: true,
    organizationId: true,
    projectId: true,
    organizerUserId: true,
    title: true,
    category: true,
    startAt: true,
    endAt: true,
    timeZone: true,
    locationType: true,
    meetingRoomId: true,
    locationText: true,
    reminderMinutes: true,
    recurrenceSeriesId: true,
    recurrenceOriginalStartAt: true,
    canceledAt: true,
    updatedAt: true,
  })
  .extend({
    room: meetingRoomSelectSchema
      .pick({ id: true, name: true, capacity: true, floor: true, active: true })
      .nullable(),
    recurrence: meetingRecurrenceSeriesSelectSchema
      .pick({
        id: true,
        frequency: true,
        interval: true,
        count: true,
        until: true,
        timeZone: true,
      })
      .nullable(),
    attendees: meetingAttendeeSelectSchema
      .pick({ userId: true, status: true })
      .array(),
  });
export type MeetingProjectionSource = z.infer<
  typeof MeetingProjectionSourceSchema
>;
