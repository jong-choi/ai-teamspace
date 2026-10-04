import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import type { Auth } from '#server/auth/auth.js';
import { ChatService } from '#server/chat/chat.service.js';
import { ChatConversationDto } from '#server/chat/dto/chat-conversation.dto.js';
import { ChatConversationListDto } from '#server/chat/dto/chat-conversation-list.dto.js';
import { ChatMessageDto } from '#server/chat/dto/chat-message.dto.js';
import { ChatMessagePageDto } from '#server/chat/dto/chat-message-page.dto.js';
import {
  CreateChatChannelDto,
  type CreateChatChannelInput,
} from '#server/chat/dto/create-chat-channel.dto.js';
import {
  CreateChatDirectDto,
  type CreateChatDirectInput,
} from '#server/chat/dto/create-chat-direct.dto.js';
import {
  MarkChatReadDto,
  type MarkChatReadInput,
} from '#server/chat/dto/mark-chat-read.dto.js';
import {
  QueryChatMessagesDto,
  type QueryChatMessagesInput,
} from '#server/chat/dto/query-chat-messages.dto.js';
import {
  SendChatMessageDto,
  type SendChatMessageInput,
} from '#server/chat/dto/send-chat-message.dto.js';
import {
  UpdateChatMessageDto,
  type UpdateChatMessageInput,
} from '#server/chat/dto/update-chat-message.dto.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';
import { interval, map, merge, type Observable } from 'rxjs';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('chat')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('chat')
@UseGuards(TrustedOriginGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Sse('events')
  events(@Session() session: UserSession<Auth>): Observable<MessageEvent> {
    return merge(
      this.chatService.events(session.user.id).pipe(
        map((event) => ({
          id: event.eventId,
          type: event.type,
          data: event,
        })),
      ),
      interval(25_000).pipe(
        map(() => ({
          type: 'heartbeat',
          data: { occurredAt: new Date().toISOString() },
        })),
      ),
    );
  }

  @Get('conversations')
  @ApiOkResponse({ standardSchema: ChatConversationListDto.schema })
  listConversations(
    @Session() session: UserSession<Auth>,
  ): Promise<ChatConversationListDto> {
    return this.chatService.listConversations(session.user.id);
  }

  @Post('channels')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: ChatConversationDto.schema })
  createChannel(
    @Session() session: UserSession<Auth>,
    @Body({ schema: CreateChatChannelDto.schema })
    input: CreateChatChannelInput,
  ): Promise<ChatConversationDto> {
    return this.chatService.createChannel(session.user.id, input);
  }

  @Post('direct')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: ChatConversationDto.schema })
  createDirect(
    @Session() session: UserSession<Auth>,
    @Body({ schema: CreateChatDirectDto.schema }) input: CreateChatDirectInput,
  ): Promise<ChatConversationDto> {
    return this.chatService.createDirect(session.user.id, input);
  }

  @Get('conversations/:conversationId')
  @ApiOkResponse({ standardSchema: ChatConversationDto.schema })
  getConversation(
    @Session() session: UserSession<Auth>,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ): Promise<ChatConversationDto> {
    return this.chatService.getConversation(session.user.id, conversationId);
  }

  @Get('conversations/:conversationId/messages')
  @ApiOkResponse({ standardSchema: ChatMessagePageDto.schema })
  listMessages(
    @Session() session: UserSession<Auth>,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Query({ schema: QueryChatMessagesDto.schema })
    query: QueryChatMessagesInput,
  ): Promise<ChatMessagePageDto> {
    return this.chatService.listMessages(
      session.user.id,
      conversationId,
      query,
    );
  }

  @Get('conversations/:conversationId/messages/:messageId')
  @ApiOkResponse({ standardSchema: ChatMessageDto.schema })
  getMessage(
    @Session() session: UserSession<Auth>,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
  ): Promise<ChatMessageDto> {
    return this.chatService.getMessage(
      session.user.id,
      conversationId,
      messageId,
    );
  }

  @Post('conversations/:conversationId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: ChatMessageDto.schema })
  sendMessage(
    @Session() session: UserSession<Auth>,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body({ schema: SendChatMessageDto.schema }) input: SendChatMessageInput,
  ): Promise<ChatMessageDto> {
    return this.chatService.sendMessage(session.user.id, conversationId, input);
  }

  @Patch('conversations/:conversationId/messages/:messageId')
  @ApiOkResponse({ standardSchema: ChatMessageDto.schema })
  updateMessage(
    @Session() session: UserSession<Auth>,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Body({ schema: UpdateChatMessageDto.schema })
    input: UpdateChatMessageInput,
  ): Promise<ChatMessageDto> {
    return this.chatService.updateMessage(
      session.user.id,
      conversationId,
      messageId,
      input,
    );
  }

  @Post('conversations/:conversationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async markRead(
    @Session() session: UserSession<Auth>,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body({ schema: MarkChatReadDto.schema }) input: MarkChatReadInput,
  ): Promise<void> {
    await this.chatService.markRead(session.user.id, conversationId, input);
  }
}
