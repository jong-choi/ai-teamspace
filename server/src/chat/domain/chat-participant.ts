import { chatParticipantSelectSchema } from '@/chat/infrastructure/persistence/drizzle/schema/chat-participant.zod';

import { z } from 'zod';

export type ChatParticipant = z.infer<typeof chatParticipantSelectSchema>;
