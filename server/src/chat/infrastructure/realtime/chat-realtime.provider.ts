import type { ChatMessageResponse } from '#server/chat/dto/chat-message.dto.js';
import type { ChatRealtimeEvent } from '#server/chat/infrastructure/realtime/chat-realtime.event.js';

import type { Observable } from 'rxjs';

export abstract class ChatRealtimeProvider {
  abstract events(userId: string): Observable<ChatRealtimeEvent>;

  abstract publishConversationChanged(
    participantUserIds: readonly string[],
    conversationId: string,
  ): Promise<void>;

  abstract publishMessageCreated(
    participantUserIds: readonly string[],
    message: ChatMessageResponse,
  ): Promise<void>;

  abstract publishMessageUpdated(
    participantUserIds: readonly string[],
    message: ChatMessageResponse,
  ): Promise<void>;

  abstract publishConversationRead(
    participantUserIds: readonly string[],
    input: {
      conversationId: string;
      userId: string;
      readAt: string;
    },
  ): Promise<void>;
}
