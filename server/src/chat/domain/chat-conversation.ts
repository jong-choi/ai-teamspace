import { chatConversationSelectSchema } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-conversation.zod.js';

import { z } from 'zod';

export type ChatConversation = z.infer<typeof chatConversationSelectSchema>;
export type ChatConversationKind = ChatConversation['kind'];
