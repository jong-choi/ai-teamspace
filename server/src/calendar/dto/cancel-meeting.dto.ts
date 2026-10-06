import { RecurrenceScopeSchema } from '@/calendar/dto/recurrence.dto';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const CancelMeetingSchema = z
  .object({
    reason: z.string().trim().min(1).max(1_000).nullable().default(null),
    scope: RecurrenceScopeSchema.default('single'),
  })
  .meta({ id: 'CancelMeeting' });

export type CancelMeetingInput = z.infer<typeof CancelMeetingSchema>;

export class CancelMeetingDto extends createZodDto(CancelMeetingSchema) {}
