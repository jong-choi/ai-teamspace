import { meetingRoomSelectSchema } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-room.zod.js';

import { z } from 'zod';

export const MeetingRoomSchema = meetingRoomSelectSchema.meta({
  id: 'MeetingRoomDomain',
});

export type MeetingRoom = z.infer<typeof MeetingRoomSchema>;
