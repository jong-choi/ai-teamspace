import { memo, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { ChatConversation } from '@repo/client/api-client/schemas';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { getConversationDisplay } from '@core/features/chat/chat-presenter';
import { useChatConversations } from '@core/features/chat/chat-query';

import { LegendList } from '@legendapp/list/react-native';
import { Bell, Hash, Plus, Search } from 'lucide-react-native';

type ConversationSidebarProps = {
  activeConversationId?: string;
  currentUserId: string;
  drawerOpen: boolean;
  onOpenCreateDialog: () => void;
  onCloseDrawer: () => void;
  onSelectConversation: (id: string) => void;
};

type SidebarItem =
  | {
      id: string;
      type: 'section';
      label: string;
    }
  | {
      id: string;
      type: 'conversation';
      conversation: ChatConversation;
    };

export function ChatConversationSidebar({
  activeConversationId,
  currentUserId,
  drawerOpen,
  onOpenCreateDialog,
  onCloseDrawer,
  onSelectConversation,
}: ConversationSidebarProps) {
  const conversations = useChatConversations().data;
  const [search, setSearch] = useState('');
  const items = useMemo(
    () => buildSidebarItems(conversations, currentUserId, search),
    [conversations, currentUserId, search],
  );

  return (
    <View
      className={cn(
        'absolute inset-y-0 left-0 z-30 w-64 border-r border-border bg-background shadow-xl md:relative md:z-auto md:flex md:shrink-0 md:translate-x-0 md:shadow-none',
        drawerOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <View className="shrink-0 flex-row items-center gap-2 border-b border-border p-3">
        <View className="relative min-w-0 flex-1">
          <Icon
            as={Search}
            className="absolute left-2.5 top-2.5 z-10 size-3.5 text-muted-foreground"
          />
          <Input
            className="h-8 pl-8 text-xs"
            onChangeText={setSearch}
            placeholder="채널 또는 동료 검색..."
            value={search}
          />
        </View>
        <Button
          accessibilityLabel="새 대화 만들기"
          className="h-8 w-8"
          onPress={onOpenCreateDialog}
          size="icon"
          variant="outline"
        >
          <Icon as={Plus} className="size-4 text-muted-foreground" />
        </Button>
      </View>

      <View className="min-h-0 flex-1">
        {items.length === 0 ? (
          <View className="px-3 py-10">
            <Text className="text-center text-xs text-muted-foreground">
              표시할 대화가 없습니다.
            </Text>
          </View>
        ) : (
          <LegendList
            contentContainerStyle={{ padding: 8, paddingBottom: 20 }}
            data={items}
            getItemType={(item) => item.type}
            keyExtractor={(item) => item.id}
            recycleItems
            renderItem={({ item }) =>
              item.type === 'section' ? (
                <Text className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </Text>
              ) : (
                <ConversationRow
                  active={item.conversation.id === activeConversationId}
                  conversation={item.conversation}
                  currentUserId={currentUserId}
                  onSelect={onSelectConversation}
                />
              )
            }
          />
        )}
      </View>

      <View className="shrink-0 items-end border-t border-border bg-muted/30 p-3 md:hidden">
        <Button
          accessibilityLabel="채널 목록 닫기"
          className="h-7 px-2"
          onPress={onCloseDrawer}
          size="sm"
          variant="ghost"
        >
          <Text className="text-[10px]">닫기</Text>
        </Button>
      </View>
    </View>
  );
}

const ConversationRow = memo(function ConversationRow({
  active,
  conversation,
  currentUserId,
  onSelect,
}: {
  active: boolean;
  conversation: ChatConversation;
  currentUserId: string;
  onSelect: (id: string) => void;
}) {
  const display = getConversationDisplay(conversation, currentUserId);
  const ConversationIcon =
    conversation.kind === 'channel'
      ? Hash
      : conversation.kind === 'system'
        ? Bell
        : null;

  return (
    <Pressable
      className={cn(
        'mb-0.5 w-full flex-row items-center justify-between rounded-lg px-2.5 py-1.5 web:hover:bg-muted/70',
        active && 'bg-muted',
      )}
      onPress={() => onSelect(conversation.id)}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
        {ConversationIcon ? (
          <Icon
            as={ConversationIcon}
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground',
              active && 'text-foreground',
            )}
          />
        ) : (
          <Avatar alt={display.title} className="size-6">
            {display.image ? (
              <AvatarImage source={{ uri: display.image }} />
            ) : null}
            <AvatarFallback>
              <Text className="text-[10px] font-semibold">
                {display.title.slice(0, 1).toUpperCase()}
              </Text>
            </AvatarFallback>
          </Avatar>
        )}
        <View className="min-w-0 flex-1">
          <Text
            className={cn(
              'truncate text-xs',
              active
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground',
            )}
          >
            {display.title}
          </Text>
          {display.subtitle ? (
            <Text className="truncate text-[10px] text-muted-foreground">
              {display.subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {conversation.unreadCount > 0 ? (
        <View className="ml-2 min-w-5 items-center rounded-full bg-primary px-1.5 py-0.5">
          <Text className="text-[10px] font-bold text-primary-foreground">
            {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

function buildSidebarItems(
  conversations: ChatConversation[],
  currentUserId: string,
  search: string,
): SidebarItem[] {
  const query = search.trim().toLowerCase();
  const filtered = query
    ? conversations.filter((conversation) => {
        const display = getConversationDisplay(conversation, currentUserId);
        const participantNames = conversation.participants
          .map(
            (participant) =>
              `${participant.name} ${participant.username ?? ''}`,
          )
          .join(' ');

        return `${display.title} ${display.subtitle} ${participantNames}`
          .toLowerCase()
          .includes(query);
      })
    : conversations;

  const items: SidebarItem[] = [];
  appendSection(items, filtered, 'system', '시스템');
  appendSection(items, filtered, 'channel', '채널 목록');
  appendSection(items, filtered, 'direct', '다이렉트 메시지');
  return items;
}

function appendSection(
  items: SidebarItem[],
  conversations: ChatConversation[],
  kind: ChatConversation['kind'],
  label: string,
): void {
  const section = conversations.filter(
    (conversation) => conversation.kind === kind,
  );
  if (section.length === 0) {
    return;
  }

  items.push({
    id: `section:${kind}`,
    type: 'section',
    label: `${label} (${section.length})`,
  });
  items.push(
    ...section.map((conversation) => ({
      id: conversation.id,
      type: 'conversation' as const,
      conversation,
    })),
  );
}
