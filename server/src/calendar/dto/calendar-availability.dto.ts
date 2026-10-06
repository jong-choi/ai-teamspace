import { meetingAttendeeSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.zod';
import { meetingRoomSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.zod';
import { meetingSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.zod';
import { MeetingDetailSchema } from '@/calendar/dto/meeting.dto';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

const instantSchema = z.string().datetime({ offset: true });

const availabilityTimeSchema = z.object({
  startAt: instantSchema,
  endAt: instantSchema,
  timeZone: meetingSelectSchema.shape.timeZone,
  meetingRoomId: meetingSelectSchema.shape.meetingRoomId.default(null),
});

function hasValidTimeRange(input: { startAt: string; endAt: string }): boolean {
  return new Date(input.endAt).getTime() > new Date(input.startAt).getTime();
}

export const CalendarAvailabilityRequestSchema = availabilityTimeSchema
  .extend({
    attendeeUserIds: z
      .array(meetingAttendeeSelectSchema.shape.userId)
      .max(500)
      .default([]),
  })
  .refine(hasValidTimeRange, {
    message: '회의 종료 시각은 시작 시각보다 늦어야 합니다.',
    path: ['endAt'],
  })
  .meta({ id: 'CalendarAvailabilityRequest' });

export const CalendarRescheduleAvailabilityRequestSchema =
  availabilityTimeSchema
    .refine(hasValidTimeRange, {
      message: '회의 종료 시각은 시작 시각보다 늦어야 합니다.',
      path: ['endAt'],
    })
    .meta({ id: 'CalendarRescheduleAvailabilityRequest' });

export const ParticipantConflictSchema = z
  .object({
    userId: meetingAttendeeSelectSchema.shape.userId,
    startAt: MeetingDetailSchema.shape.startAt,
    endAt: MeetingDetailSchema.shape.endAt,
    sourceType: z.enum(['organizer', 'attendee']),
  })
  .meta({ id: 'CalendarParticipantConflict' });

export const RoomConflictSchema = z
  .object({
    meetingRoomId: meetingRoomSelectSchema.shape.id,
    startAt: MeetingDetailSchema.shape.startAt,
    endAt: MeetingDetailSchema.shape.endAt,
  })
  .meta({ id: 'CalendarRoomConflict' });

export const CalendarAvailabilityResponseSchema = z
  .object({
    available: z.boolean(),
    participantConflicts: z.array(ParticipantConflictSchema),
    roomConflict: RoomConflictSchema.nullable(),
  })
  .meta({ id: 'CalendarAvailabilityResponse' });

export type CalendarAvailabilityRequest = z.infer<
  typeof CalendarAvailabilityRequestSchema
>;
export type CalendarRescheduleAvailabilityRequest = z.infer<
  typeof CalendarRescheduleAvailabilityRequestSchema
>;
export type CalendarAvailabilityResponse = z.infer<
  typeof CalendarAvailabilityResponseSchema
>;

export class CalendarAvailabilityRequestDto extends createZodDto(
  CalendarAvailabilityRequestSchema,
) {}
export class CalendarRescheduleAvailabilityRequestDto extends createZodDto(
  CalendarRescheduleAvailabilityRequestSchema,
) {}
export class CalendarAvailabilityResponseDto extends createZodDto(
  CalendarAvailabilityResponseSchema,
) {}
