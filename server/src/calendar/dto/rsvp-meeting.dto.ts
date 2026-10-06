import { meetingAttendeeSelectSchema } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.zod.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const RsvpMeetingSchema = z
  .object({
    status: meetingAttendeeSelectSchema.shape.status.exclude(['pending']),
  })
  .meta({ id: 'RsvpMeeting' });

export type RsvpMeetingInput = z.infer<typeof RsvpMeetingSchema>;

export class RsvpMeetingDto extends createZodDto(RsvpMeetingSchema) {}
