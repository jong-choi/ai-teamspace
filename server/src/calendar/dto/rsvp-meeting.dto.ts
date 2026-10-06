import { meetingAttendeeSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const RsvpMeetingSchema = z
  .object({
    status: meetingAttendeeSelectSchema.shape.status.exclude(['pending']),
  })
  .meta({ id: 'RsvpMeeting' });

export type RsvpMeetingInput = z.infer<typeof RsvpMeetingSchema>;

export class RsvpMeetingDto extends createZodDto(RsvpMeetingSchema) {}
