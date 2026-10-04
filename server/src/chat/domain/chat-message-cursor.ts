import { ChatInvalidCursorError } from '#server/chat/domain/chat.error.js';

import { z } from 'zod';

const chatMessageCursorPayloadSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

export type ChatMessageCursor = {
  createdAt: Date;
  id: string;
};

export function encodeChatMessageCursor(cursor: ChatMessageCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeChatMessageCursor(value: string): ChatMessageCursor {
  try {
    const parsed = chatMessageCursorPayloadSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    return {
      createdAt: new Date(parsed.createdAt),
      id: parsed.id,
    };
  } catch (error) {
    throw new ChatInvalidCursorError({ cause: error });
  }
}
