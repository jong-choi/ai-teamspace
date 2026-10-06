import { meetingRoomSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.zod';

import { z } from 'zod';

export const MeetingRoomSchema = meetingRoomSelectSchema.meta({
  id: 'MeetingRoomDomain',
});

export type MeetingRoom = z.infer<typeof MeetingRoomSchema>;
