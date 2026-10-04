import { chatParticipantSelectSchema } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-participant.zod.js';

import { z } from 'zod';

export type ChatParticipant = z.infer<typeof chatParticipantSelectSchema>;
