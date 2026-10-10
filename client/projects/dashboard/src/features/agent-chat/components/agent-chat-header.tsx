import { View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';

import {
  History,
  Maximize2,
  Minimize2,
  Sparkles,
  SquarePen,
  X,
} from 'lucide-react-native';

export function AgentChatHeader({
  expanded,
  listOpen,
  onClose,
  onNewThread,
  onToggleExpand,
  onToggleList,
  showExpand,
  showListToggle,
  title,
}: {
  expanded: boolean;
  listOpen: boolean;
  onClose: () => void;
  onNewThread: () => void;
  onToggleExpand: () => void;
  onToggleList: () => void;
  showExpand: boolean;
  showListToggle: boolean;
  title: string;
}) {
  return (
    <View className="h-12 shrink-0 flex-row items-center justify-between gap-2 border-b border-border/60 px-3">
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <Icon
          as={Sparkles}
          className="size-3.5 text-violet-500 dark:text-violet-400"
        />
        <Text className="min-w-0 flex-1 text-sm font-medium" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View className="flex-row items-center gap-0.5">
        {showListToggle ? (
          <Button
            accessibilityLabel="대화 목록"
            accessibilityState={{ expanded: listOpen }}
            className="h-8 w-8"
            onPress={onToggleList}
            size="icon"
            variant="ghost"
          >
            <Icon as={History} className="size-4 text-muted-foreground" />
          </Button>
        ) : null}
        <Button
          accessibilityLabel="새 대화"
          className="h-8 w-8"
          onPress={onNewThread}
          size="icon"
          variant="ghost"
        >
          <Icon as={SquarePen} className="size-4 text-muted-foreground" />
        </Button>
        {showExpand ? (
          <Button
            accessibilityLabel={expanded ? '채팅 축소' : '채팅 확대'}
            className="h-8 w-8"
            onPress={onToggleExpand}
            size="icon"
            variant="ghost"
          >
            <Icon
              as={expanded ? Minimize2 : Maximize2}
              className="size-4 text-muted-foreground"
            />
          </Button>
        ) : null}
        <Button
          accessibilityLabel="채팅 닫기"
          className="h-8 w-8"
          onPress={onClose}
          size="icon"
          variant="ghost"
        >
          <Icon as={X} className="size-4 text-muted-foreground" />
        </Button>
      </View>
    </View>
  );
}
