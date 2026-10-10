import { created } from '#seed/api.ts';
import type { SeedContext } from '#seed/context.ts';
import type { ChatFile, ChatMessage } from '#seed/source.ts';

export async function seedChat(
  context: SeedContext,
  file: ChatFile,
): Promise<void> {
  for (const channel of file.channels) {
    const conversation = await context.session(channel.creator).post(
      '/chat/channels',
      {
        name: channel.name,
        topic: channel.topic,
        participantUserIds: channel.participants.map((name) =>
          context.userId(name),
        ),
      },
      created,
    );
    await seedMessages({
      context,
      conversationId: conversation.id,
      messages: channel.messages,
      participants: [channel.creator, ...channel.participants],
      subject: `채널 #${channel.name}`,
      unread: channel.unread,
    });
  }

  for (const direct of file.directs) {
    const [first, second] = direct.between;
    const conversation = await context
      .session(first)
      .post(
        '/chat/direct',
        { recipientUserId: context.userId(second) },
        created,
      );
    await seedMessages({
      context,
      conversationId: conversation.id,
      messages: direct.messages,
      participants: direct.between,
      subject: `${first}와 ${second}의 대화`,
      unread: direct.unread,
    });
  }
  console.log(
    `채널 ${file.channels.length}개와 일대일 대화 ${file.directs.length}개를 넣었습니다.`,
  );
}

async function seedMessages(input: {
  context: SeedContext;
  conversationId: string;
  messages: readonly ChatMessage[];
  participants: readonly string[];
  subject: string;
  unread: number;
}): Promise<void> {
  const { context } = input;
  const ordered = input.messages
    .map((message) => {
      if (!input.participants.includes(message.from)) {
        throw new Error(
          `참여자가 아닌 사람이 보낸 메시지입니다: ${input.subject} → ${message.from}`,
        );
      }
      return { message, at: context.past(message.at, input.subject) };
    })
    .sort((left, right) => left.at.getTime() - right.at.getTime());
  const [first] = ordered;
  if (!first) return;

  const messageIds: string[] = [];
  let lastAt = first.at;
  for (const [index, { message, at }] of ordered.entries()) {
    const sent = await context
      .session(message.from)
      .post(
        `/chat/conversations/${input.conversationId}/messages`,
        { text: message.text },
        created,
      );
    // 같은 분에 보낸 메시지도 순서가 유지되도록 초를 다르게 준다.
    lastAt = new Date(at.getTime() + index * 1000);
    messageIds.push(sent.id);
    context.backdates.push({ kind: 'chatMessage', id: sent.id, at: lastAt });
  }
  context.backdates.push({
    kind: 'chatConversation',
    id: input.conversationId,
    startedAt: first.at,
    updatedAt: lastAt,
  });

  // 데모 계정은 마지막 unread개를 뺀 나머지를 읽은 것으로 둔다.
  if (!input.participants.includes(context.demoUsername)) return;
  const lastReadMessageId = messageIds.at(-1 - input.unread);
  if (!lastReadMessageId) return;
  context.pendingReads.push({
    conversationId: input.conversationId,
    messageId: lastReadMessageId,
  });
}
