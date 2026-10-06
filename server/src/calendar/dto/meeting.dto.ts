import { CalendarProjectSummarySchema } from '@/calendar/domain/calendar-project-summary';
import { MeetingSchema as MeetingDomainSchema } from '@/calendar/domain/meeting';
import { MeetingRoomSchema } from '@/calendar/dto/meeting-room.dto';
import { MeetingRecurrenceSchema } from '@/calendar/dto/recurrence.dto';
import { meetingAttendeeSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';
import { OrganizationUserSummarySchema } from '@/organizations/domain/organization-member';

import { z } from 'zod';

const MeetingWireSchema = MeetingDomainSchema.omit({
  startAt: true,
  endAt: true,
  createdAt: true,
  updatedAt: true,
  canceledAt: true,
  recurrenceOriginalStartAt: true,
}).extend({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  canceledAt: z.string().datetime().nullable(),
  recurrenceOriginalStartAt: z.string().datetime().nullable(),
});

export const MeetingRoomReferenceSchema = MeetingRoomSchema.pick({
  id: true,
  name: true,
  capacity: true,
  floor: true,
  active: true,
}).meta({ id: 'MeetingRoomReference' });

export const MeetingAttendeeResponseSchema = z
  .object({
    user: OrganizationUserSummarySchema,
    status: meetingAttendeeSelectSchema.shape.status,
  })
  .meta({ id: 'MeetingAttendee' });

export const MeetingSummarySchema = MeetingWireSchema.omit({
  agendaMarkdown: true,
  notesMarkdown: true,
  reminderMinutes: true,
})
  .extend({
    organizer: OrganizationUserSummarySchema,
    attendeeCount: z.number().int().min(0),
    meetingRoom: MeetingRoomReferenceSchema.nullable(),
    project: CalendarProjectSummarySchema.nullable(),
    recurrence: MeetingRecurrenceSchema.nullable(),
  })
  .meta({ id: 'MeetingSummary' });

export const MeetingListSchema = z
  .object({ items: z.array(MeetingSummarySchema) })
  .meta({ id: 'MeetingList' });

export const MeetingDetailSchema = MeetingWireSchema.extend({
  organizer: OrganizationUserSummarySchema,
  attendees: z.array(MeetingAttendeeResponseSchema),
  meetingRoom: MeetingRoomReferenceSchema.nullable(),
  project: CalendarProjectSummarySchema.nullable(),
  recurrence: MeetingRecurrenceSchema.nullable(),
}).meta({ id: 'MeetingDetail' });

export type MeetingWireResponse = z.infer<typeof MeetingWireSchema>;
export type MeetingSummaryResponse = z.infer<typeof MeetingSummarySchema>;
export type MeetingListResponse = z.infer<typeof MeetingListSchema>;
export type MeetingDetailResponse = z.infer<typeof MeetingDetailSchema>;

export class MeetingListDto extends createZodDto(MeetingListSchema) {}
export class MeetingDetailDto extends createZodDto(MeetingDetailSchema) {}
