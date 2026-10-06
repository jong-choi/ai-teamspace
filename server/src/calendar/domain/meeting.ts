import { meetingSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.zod';

import { z } from 'zod';

export const MeetingSchema = meetingSelectSchema.meta({ id: 'MeetingDomain' });

export type Meeting = z.infer<typeof MeetingSchema>;
