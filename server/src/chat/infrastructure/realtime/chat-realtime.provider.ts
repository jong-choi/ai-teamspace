import type { ChatMessageResponse } from '@/chat/dto/chat-message.dto';
import type { ChatRealtimeEvent } from '@/chat/infrastructure/realtime/chat-realtime.event';

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
