import type { ChatParticipant } from '@/chat/domain/chat-participant';
import {
  chatParticipantInsertSchema,
  chatParticipantSelectSchema,
  chatParticipantUpdateSchema,
} from '@/chat/infrastructure/persistence/drizzle/schema/chat-participant.zod';

import type { z } from 'zod';

export function toChatParticipantDomain(row: unknown): ChatParticipant {
  return chatParticipantSelectSchema.parse(row);
}

export function toChatParticipantInsert(
  input: z.input<typeof chatParticipantInsertSchema>,
) {
  return chatParticipantInsertSchema.parse(input);
}

export function toChatParticipantUpdate(
  input: z.input<typeof chatParticipantUpdateSchema>,
) {
  return chatParticipantUpdateSchema.parse(input);
}
