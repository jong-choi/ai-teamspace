import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { AuthUserDirectoryService } from '#server/auth/auth-user-directory.service.js';
import {
  ChatAccessDeniedError,
  ChatConversationNotFoundError,
  ChatDirectConversationConflictError,
  ChatMessageNotFoundError,
  ChatParticipantUnavailableError,
} from '#server/chat/domain/chat.error.js';
import type { ChatConversationState } from '#server/chat/domain/chat-conversation-state.js';
import { chatTextMessageContentSchema } from '#server/chat/domain/chat-message-content.js';
import {
  decodeChatMessageCursor,
  encodeChatMessageCursor,
} from '#server/chat/domain/chat-message-cursor.js';
import {
  type ChatConversationResponse,
  toChatConversationResponse,
} from '#server/chat/dto/chat-conversation.dto.js';
import type { ChatConversationListResponse } from '#server/chat/dto/chat-conversation-list.dto.js';
import {
  type ChatMessageResponse,
  toChatMessageResponse,
} from '#server/chat/dto/chat-message.dto.js';
import type { ChatMessagePageResponse } from '#server/chat/dto/chat-message-page.dto.js';
import type { CreateChatChannelInput } from '#server/chat/dto/create-chat-channel.dto.js';
import type { CreateChatDirectInput } from '#server/chat/dto/create-chat-direct.dto.js';
import type { MarkChatReadInput } from '#server/chat/dto/mark-chat-read.dto.js';
import type { QueryChatMessagesInput } from '#server/chat/dto/query-chat-messages.dto.js';
import type { SendChatMessageInput } from '#server/chat/dto/send-chat-message.dto.js';
import type { UpdateChatMessageInput } from '#server/chat/dto/update-chat-message.dto.js';
import { ChatRepository } from '#server/chat/infrastructure/persistence/chat.repository.js';
import { ChatRealtimeProvider } from '#server/chat/infrastructure/realtime/chat-realtime.provider.js';

export type DeliverOrganizationInvitationInput = {
  recipientUserId: string;
  invitationId: string;
  organizationId: string;
  inviterUserId: string;
  organizationNameAtSend?: string;
  inviterDisplayNameAtSend?: string;
  republishExistingMessage?: boolean;
};

type ChatUserDirectory = Pick<
  AuthUserDirectoryService,
  'resolveExactUsername' | 'findByIds'
>;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly chatRepository: ChatRepository,
    @Inject(AuthUserDirectoryService)
    private readonly userDirectory: ChatUserDirectory,
    private readonly realtime: ChatRealtimeProvider,
  ) {}

  events(userId: string): ReturnType<ChatRealtimeProvider['events']> {
    return this.realtime.events(userId);
  }

  async deliverOrganizationInvitation(
    input: DeliverOrganizationInvitationInput,
  ): Promise<ChatMessageResponse> {
    const result = await this.chatRepository.deliverReferencedSystemMessage({
      recipientUserId: input.recipientUserId,
      contentType: 'organization_invitation',
      content: {
        type: 'organization_invitation',
        invitationId: input.invitationId,
        organizationId: input.organizationId,
        inviterUserId: input.inviterUserId,
        ...(input.organizationNameAtSend
          ? { organizationNameAtSend: input.organizationNameAtSend }
          : {}),
        ...(input.inviterDisplayNameAtSend
          ? { inviterDisplayNameAtSend: input.inviterDisplayNameAtSend }
          : {}),
      },
      referenceKind: 'organization_invitation',
      referenceId: input.invitationId,
    });
    const response = toChatMessageResponse(result.message);

    if (result.conversationCreated) {
      await this.publishBestEffort(() =>
        this.realtime.publishConversationChanged(
          [input.recipientUserId],
          result.conversation.id,
        ),
      );
    }
    if (result.messageCreated || input.republishExistingMessage) {
      await this.publishBestEffort(() =>
        this.realtime.publishMessageCreated([input.recipientUserId], response),
      );
    }

    return response;
  }

  async listConversations(
    userId: string,
  ): Promise<ChatConversationListResponse> {
    const states = await this.chatRepository.listConversationStates(userId);
    return { items: await this.toConversationResponses(states) };
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ChatConversationResponse> {
    const state = await this.chatRepository.findConversationState(
      conversationId,
      userId,
    );
    if (!state) {
      throw new ChatConversationNotFoundError();
    }

    const [response] = await this.toConversationResponses([state]);
    if (!response) {
      throw new ChatConversationNotFoundError();
    }
    return response;
  }

  async createChannel(
    userId: string,
    input: CreateChatChannelInput,
  ): Promise<ChatConversationResponse> {
    const participantUsernames = [
      ...new Set(
        (input.participantUsernames ?? []).map((username) =>
          username.trim().toLowerCase(),
        ),
      ),
    ];
    const resolvedParticipants = await Promise.all(
      participantUsernames.map((username) =>
        this.userDirectory.resolveExactUsername(username),
      ),
    );
    if (resolvedParticipants.some((participant) => participant === null)) {
      throw new ChatParticipantUnavailableError();
    }

    const participantUserIds = [
      ...new Set([
        userId,
        ...resolvedParticipants.flatMap((participant) =>
          participant ? [participant.id] : [],
        ),
      ]),
    ];

    const conversation = await this.chatRepository.createChannelConversation({
      name: input.name,
      topic: input.topic || null,
      participantUserIds,
    });
    await this.realtime.publishConversationChanged(
      participantUserIds,
      conversation.id,
    );

    return this.getConversation(userId, conversation.id);
  }

  async createDirect(
    userId: string,
    input: CreateChatDirectInput,
  ): Promise<ChatConversationResponse> {
    const recipient = await this.userDirectory.resolveExactUsername(
      input.recipientUsername,
    );
    if (!recipient || recipient.id === userId) {
      throw new ChatDirectConversationConflictError();
    }

    const participantUserIds = [userId, recipient.id].sort();
    const directKey = createDirectConversationKey(participantUserIds);
    const existing = await this.chatRepository.findDirectByKey(
      directKey,
      userId,
    );
    if (existing) {
      return this.getConversation(userId, existing.id);
    }

    const created = await this.chatRepository.createDirectConversation({
      directKey,
      participantUserIds,
    });
    if (created) {
      await this.realtime.publishConversationChanged(
        participantUserIds,
        created.id,
      );
      return this.getConversation(userId, created.id);
    }

    const concurrent = await this.chatRepository.findDirectByKey(
      directKey,
      userId,
    );
    if (concurrent) {
      return this.getConversation(userId, concurrent.id);
    }
    throw new ChatDirectConversationConflictError();
  }

  async listMessages(
    userId: string,
    conversationId: string,
    query: QueryChatMessagesInput,
  ): Promise<ChatMessagePageResponse> {
    const page = await this.chatRepository.listMessages({
      conversationId,
      userId,
      before: query.before ? decodeChatMessageCursor(query.before) : undefined,
      limit: query.limit,
    });
    if (!page) {
      throw new ChatConversationNotFoundError();
    }
    const oldest = page.items[0];

    return {
      items: page.items.map(toChatMessageResponse),
      nextCursor:
        page.hasMore && oldest
          ? encodeChatMessageCursor({
              createdAt: oldest.createdAt,
              id: oldest.id,
            })
          : null,
    };
  }

  async getMessage(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<ChatMessageResponse> {
    const message = await this.chatRepository.findMessage(
      conversationId,
      messageId,
      userId,
    );
    if (!message) {
      throw new ChatMessageNotFoundError();
    }
    return toChatMessageResponse(message);
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    input: SendChatMessageInput,
  ): Promise<ChatMessageResponse> {
    const state = await this.requireConversationState(userId, conversationId);
    const message = await this.chatRepository.createTextMessage({
      conversationId,
      senderUserId: userId,
      text: input.text,
    });
    const response = toChatMessageResponse(message);
    await this.realtime.publishMessageCreated(
      state.participants.map((participant) => participant.userId),
      response,
    );
    return response;
  }

  async updateMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    input: UpdateChatMessageInput,
  ): Promise<ChatMessageResponse> {
    const current = await this.chatRepository.findMessage(
      conversationId,
      messageId,
      userId,
    );
    if (!current) {
      throw new ChatMessageNotFoundError();
    }
    if (
      current.senderKind !== 'user' ||
      current.senderUserId !== userId ||
      current.contentType !== 'text'
    ) {
      throw new ChatAccessDeniedError();
    }
    const currentContent = chatTextMessageContentSchema.parse(current.content);
    if (currentContent.text === input.text) {
      return toChatMessageResponse(current);
    }

    const state = await this.requireConversationState(userId, conversationId);
    const updated = await this.chatRepository.updateTextMessage({
      conversationId,
      messageId,
      senderUserId: userId,
      text: input.text,
    });
    if (!updated) {
      throw new ChatMessageNotFoundError();
    }
    const response = toChatMessageResponse(updated);
    await this.realtime.publishMessageUpdated(
      state.participants.map((participant) => participant.userId),
      response,
    );
    return response;
  }

  async markRead(
    userId: string,
    conversationId: string,
    input: MarkChatReadInput,
  ): Promise<void> {
    const message = await this.chatRepository.findMessage(
      conversationId,
      input.messageId,
      userId,
    );
    if (!message) {
      throw new ChatMessageNotFoundError();
    }

    const result = await this.chatRepository.markRead({
      conversationId,
      userId,
      readAt: message.createdAt,
    });
    if (result === null) {
      throw new ChatConversationNotFoundError();
    }
    if (result === 'unchanged') {
      return;
    }

    await this.realtime.publishConversationRead([userId], {
      conversationId,
      userId,
      readAt: message.createdAt.toISOString(),
    });
  }

  private async publishBestEffort(
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation();
    } catch {
      this.logger.warn('채팅 실시간 이벤트 발행에 실패했습니다.');
    }
  }

  private async requireConversationState(
    userId: string,
    conversationId: string,
  ): Promise<ChatConversationState> {
    const state = await this.chatRepository.findConversationState(
      conversationId,
      userId,
    );
    if (!state) {
      throw new ChatConversationNotFoundError();
    }
    return state;
  }

  private async toConversationResponses(
    states: readonly ChatConversationState[],
  ): Promise<ChatConversationResponse[]> {
    const participantUserIds = [
      ...new Set(
        states.flatMap((state) =>
          state.participants.map((participant) => participant.userId),
        ),
      ),
    ];
    const users = await this.userDirectory.findByIds(participantUserIds);
    const usersById = new Map(users.map((user) => [user.id, user]));

    return states.map((state) => toChatConversationResponse(state, usersById));
  }
}

function createDirectConversationKey(
  participantUserIds: readonly string[],
): string {
  return createHash('sha256')
    .update([...participantUserIds].sort().join('\0'))
    .digest('hex');
}
