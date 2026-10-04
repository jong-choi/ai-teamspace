import { chatMessageContentSchema } from '#server/chat/domain/chat-message-content.js';
import { chatMessageSelectSchema } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-message.zod.js';

import { z } from 'zod';

export type ChatMessage = z.infer<typeof chatMessageSelectSchema>;
export type ChatMessageContent = z.infer<typeof chatMessageContentSchema>;
