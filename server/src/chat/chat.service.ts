import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { AuthUserDirectoryService } from '@/auth/auth-user-directory.service';
import {
  ChatAccessDeniedError,
  ChatConversationNotFoundError,
  ChatDirectConversationConflictError,
  ChatMessageNotFoundError,
  ChatParticipantUnavailableError,
} from '@/chat/domain/chat.error';
import type { ChatConversationState } from '@/chat/domain/chat-conversation-state';
import { chatTextMessageContentSchema } from '@/chat/domain/chat-message-content';
import { encodeChatMessageCursor } from '@/chat/domain/chat-message-cursor';
import {
  type ChatConversationResponse,
  toChatConversationResponse,
} from '@/chat/dto/chat-conversation.dto';
import type { ChatConversationListResponse } from '@/chat/dto/chat-conversation-list.dto';
import {
  type ChatMessageResponse,
  toChatMessageResponse,
} from '@/chat/dto/chat-message.dto';
import type { ChatMessagePageResponse } from '@/chat/dto/chat-message-page.dto';
import type { CreateChatChannelInput } from '@/chat/dto/create-chat-channel.dto';
import type { CreateChatDirectInput } from '@/chat/dto/create-chat-direct.dto';
import type { MarkChatReadInput } from '@/chat/dto/mark-chat-read.dto';
import type { QueryChatMessagesInput } from '@/chat/dto/query-chat-messages.dto';
import type { SendChatMessageInput } from '@/chat/dto/send-chat-message.dto';
import type { UpdateChatMessageInput } from '@/chat/dto/update-chat-message.dto';
import { ChatRepository } from '@/chat/infrastructure/persistence/chat.repository';
import { ChatRealtimeProvider } from '@/chat/infrastructure/realtime/chat-realtime.provider';
import { MembershipProjectionQueryService } from '@/organizations/membership-projection-query.service';

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
type ChatOrganizationMembership = Pick<
  MembershipProjectionQueryService,
  'hasMember'
>;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly chatRepository: ChatRepository,
    @Inject(AuthUserDirectoryService)
    private readonly userDirectory: ChatUserDirectory,
    private readonly realtime: ChatRealtimeProvider,
    @Inject(MembershipProjectionQueryService)
    private readonly organizations: ChatOrganizationMembership,
  ) {}

  events(userId: string): ReturnType<ChatRealtimeProvider['events']> {
    return this.realtime.events(userId);
  }

  async deliverOrganizationInvitation(
    input: DeliverOrganizationInvitationInput,
  ): Promise<ChatMessageResponse> {
    const result = await this.chatRepository.deliverReferencedSystemMessage(
      input.recipientUserId,
      {
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
      },
      'organization_invitation',
      input.invitationId,
    );
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
    activeOrganizationId?: string,
  ): Promise<ChatConversationResponse> {
    const memberUserIds = [...new Set(input.participantUserIds ?? [])];
    if (
      !(await this.areActiveOrganizationMembers(
        userId,
        activeOrganizationId,
        memberUserIds,
      ))
    ) {
      throw new ChatParticipantUnavailableError();
    }

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
        ...memberUserIds,
        ...resolvedParticipants.flatMap((participant) =>
          participant ? [participant.id] : [],
        ),
      ]),
    ];

    const conversation = await this.chatRepository.createChannelConversation(
      input,
      participantUserIds,
    );
    await this.realtime.publishConversationChanged(
      participantUserIds,
      conversation.id,
    );

    return this.getConversation(userId, conversation.id);
  }

  async createDirect(
    userId: string,
    input: CreateChatDirectInput,
    activeOrganizationId?: string,
  ): Promise<ChatConversationResponse> {
    const recipientId = await this.resolveDirectRecipientId(
      userId,
      input,
      activeOrganizationId,
    );
    if (!recipientId || recipientId === userId) {
      throw new ChatDirectConversationConflictError();
    }

    const participantUserIds = [userId, recipientId].sort();
    const directKey = createDirectConversationKey(participantUserIds);
    const existing = await this.chatRepository.findDirectByKey(
      directKey,
      userId,
    );
    if (existing) {
      return this.getConversation(userId, existing.id);
    }

    const created = await this.chatRepository.createDirectConversation(
      directKey,
      participantUserIds,
    );
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

  private async resolveDirectRecipientId(
    userId: string,
    input: CreateChatDirectInput,
    activeOrganizationId?: string,
  ): Promise<string | null> {
    if (input.recipientUserId !== undefined) {
      const allowed = await this.areActiveOrganizationMembers(
        userId,
        activeOrganizationId,
        [input.recipientUserId],
      );
      return allowed ? input.recipientUserId : null;
    }
    if (input.recipientUsername === undefined) return null;
    const recipient = await this.userDirectory.resolveExactUsername(
      input.recipientUsername,
    );
    return recipient?.id ?? null;
  }

  // user ID로 지정한 참여자는 요청자와 같은 활성 조직의 멤버여야 한다. 임의 ID로 대화를 여는 것을 막는다.
  private async areActiveOrganizationMembers(
    userId: string,
    activeOrganizationId: string | undefined,
    memberUserIds: readonly string[],
  ): Promise<boolean> {
    if (memberUserIds.length === 0) return true;
    if (!activeOrganizationId) return false;
    const memberships = await Promise.all(
      [userId, ...memberUserIds].map((memberUserId) =>
        this.organizations.hasMember(activeOrganizationId, memberUserId),
      ),
    );
    return memberships.every(Boolean);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    query: QueryChatMessagesInput,
  ): Promise<ChatMessagePageResponse> {
    const page = await this.chatRepository.listMessages(
      conversationId,
      userId,
      query,
    );
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
    const message = await this.chatRepository.createTextMessage(
      conversationId,
      userId,
      input,
    );
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
    const updated = await this.chatRepository.updateTextMessage(
      conversationId,
      messageId,
      userId,
      input,
    );
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
    const result = await this.chatRepository.markRead(
      conversationId,
      userId,
      input,
    );
    if (result === null) {
      throw new ChatConversationNotFoundError();
    }
    if (result.status === 'message_not_found') {
      throw new ChatMessageNotFoundError();
    }
    if (result.status === 'unchanged') {
      return;
    }

    await this.realtime.publishConversationRead([userId], {
      conversationId,
      userId,
      readAt: result.readAt.toISOString(),
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
