import { chatConversationSelectSchema } from '@/chat/infrastructure/persistence/drizzle/schema/chat-conversation.zod';

import { z } from 'zod';

export type ChatConversation = z.infer<typeof chatConversationSelectSchema>;
export type ChatConversationKind = ChatConversation['kind'];
