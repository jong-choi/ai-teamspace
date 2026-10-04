import { chatParticipant } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-participant.schema.js';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

export const chatParticipantSelectSchema = createSelectSchema(chatParticipant);
export const chatParticipantInsertSchema = createInsertSchema(chatParticipant);
export const chatParticipantUpdateSchema = createUpdateSchema(chatParticipant);
