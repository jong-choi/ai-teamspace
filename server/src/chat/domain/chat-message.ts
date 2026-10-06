import { chatMessageContentSchema } from '@/chat/domain/chat-message-content';
import { chatMessageSelectSchema } from '@/chat/infrastructure/persistence/drizzle/schema/chat-message.zod';

import { z } from 'zod';

export type ChatMessage = z.infer<typeof chatMessageSelectSchema>;
export type ChatMessageContent = z.infer<typeof chatMessageContentSchema>;
