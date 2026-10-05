import { CalendarProjectSummarySchema } from '#server/calendar/domain/calendar-project-summary.js';
import { MeetingSchema as MeetingDomainSchema } from '#server/calendar/domain/meeting.js';
import { MeetingRoomSchema } from '#server/calendar/dto/meeting-room.dto.js';
import { meetingAttendeeSelectSchema } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.zod.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { OrganizationUserSummarySchema } from '#server/organizations/domain/organization-member.js';

import { z } from 'zod';

const MeetingWireSchema = MeetingDomainSchema.omit({
  startAt: true,
  endAt: true,
  createdAt: true,
  updatedAt: true,
  canceledAt: true,
}).extend({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  canceledAt: z.string().datetime().nullable(),
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
}).meta({ id: 'MeetingDetail' });

export type MeetingWireResponse = z.infer<typeof MeetingWireSchema>;
export type MeetingSummaryResponse = z.infer<typeof MeetingSummarySchema>;
export type MeetingListResponse = z.infer<typeof MeetingListSchema>;
export type MeetingDetailResponse = z.infer<typeof MeetingDetailSchema>;

export class MeetingListDto extends createZodDto(MeetingListSchema) {}
export class MeetingDetailDto extends createZodDto(MeetingDetailSchema) {}
