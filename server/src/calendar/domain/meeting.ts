import { meetingSelectSchema } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting.zod.js';

import { z } from 'zod';

export const MeetingSchema = meetingSelectSchema.meta({ id: 'MeetingDomain' });

export type Meeting = z.infer<typeof MeetingSchema>;
