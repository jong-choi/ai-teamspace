import { meetingTimeZoneSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

const instantSchema = z.string().datetime({ offset: true });

const availabilityTimeSchema = z.object({
  startAt: instantSchema,
  endAt: instantSchema,
  timeZone: meetingTimeZoneSchema,
  meetingRoomId: z.string().uuid().nullable().default(null),
});

function hasValidTimeRange(input: { startAt: string; endAt: string }): boolean {
  return new Date(input.endAt).getTime() > new Date(input.startAt).getTime();
}

export const CalendarAvailabilityRequestSchema = availabilityTimeSchema
  .extend({
    attendeeUserIds: z.array(z.string().trim().min(1)).max(500).default([]),
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
    userId: z.string().min(1),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    sourceType: z.enum(['organizer', 'attendee']),
  })
  .meta({ id: 'CalendarParticipantConflict' });

export const RoomConflictSchema = z
  .object({
    meetingRoomId: z.string().uuid(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
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
