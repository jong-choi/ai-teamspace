import type {
  ChatConversation,
  ChatParticipant,
} from '@repo/client/api-client/schemas';

export type ChatParticipantDisplay = Pick<
  ChatParticipant,
  'userId' | 'name' | 'username' | 'image'
>;

export type ConversationDisplay = {
  title: string;
  subtitle: string;
  image: string | null;
};

type ConversationDisplayParticipant = Pick<
  ChatConversation['participants'][number],
  'userId' | 'name' | 'username' | 'image'
>;

type ConversationDisplayInput = Pick<
  ChatConversation,
  'kind' | 'name' | 'topic'
> & {
  participants: readonly ConversationDisplayParticipant[];
};

const messageTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
});
const messageDateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function getConversationDisplay(
  conversation: ConversationDisplayInput,
  currentUserId: string,
): ConversationDisplay {
  switch (conversation.kind) {
    case 'channel':
      return {
        title: `# ${conversation.name ?? '이름 없는 채널'}`,
        subtitle: conversation.topic ?? '',
        image: null,
      };
    case 'system':
      return {
        title: conversation.name ?? '시스템',
        subtitle: conversation.topic ?? '시스템 알림과 메시지',
        image: null,
      };
    case 'direct': {
      const peer = conversation.participants.find(
        (participant) => participant.userId !== currentUserId,
      );

      return {
        title: peer?.name ?? '대화 상대 없음',
        subtitle: peer?.username
          ? `@${peer.username}`
          : (conversation.topic ?? ''),
        image: peer?.image ?? null,
      };
    }
  }
}

export function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return messageTimeFormatter.format(date);
}

export function formatMessageDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return messageDateTimeFormatter.format(date);
}

export function getCanonicalMessagePath(
  conversationId: string,
  messageId: string,
): string {
  return `/chat/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;
}
