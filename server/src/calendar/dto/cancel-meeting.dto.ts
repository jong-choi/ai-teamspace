import { RecurrenceScopeSchema } from '@/calendar/dto/recurrence.dto';
import { meetingUpdateSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const CancelMeetingSchema = z
  .object({
    reason: meetingUpdateSchema.shape.cancelReason.default(null),
    scope: RecurrenceScopeSchema.default('single'),
  })
  .meta({ id: 'CancelMeeting' });

export type CancelMeetingInput = z.infer<typeof CancelMeetingSchema>;

export class CancelMeetingDto extends createZodDto(CancelMeetingSchema) {}
