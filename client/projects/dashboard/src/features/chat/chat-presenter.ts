import type { ChatControllerListConversations200ItemsItem } from '@monorepo-erp/api-client';

export type ConversationDisplay = {
  title: string;
  subtitle: string;
  image: string | null;
};

type ConversationDisplayParticipant = Pick<
  ChatControllerListConversations200ItemsItem['participants'][number],
  'userId' | 'name' | 'username' | 'image'
>;

type ConversationDisplayInput = Pick<
  ChatControllerListConversations200ItemsItem,
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

export function getProblemDetail(error: unknown): string | null {
  const direct = getStringProperty(error, 'detail');
  if (direct) {
    return direct;
  }

  if (!isRecord(error) || !('info' in error)) {
    return null;
  }

  return getStringProperty(error.info, 'detail');
}

export function getCanonicalMessagePath(
  conversationId: string,
  messageId: string,
): string {
  return `/chat/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;
}

function getStringProperty(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
