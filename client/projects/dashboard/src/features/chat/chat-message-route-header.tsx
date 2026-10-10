import { View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';

import { ArrowLeft } from 'lucide-react-native';

export function ChatMessageRouteHeader({
  description,
  onBack,
  title,
}: {
  description: string;
  onBack: () => void;
  title: string;
}) {
  return (
    <View className="shrink-0 flex-row items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
      <Button
        accessibilityLabel="채팅으로 돌아가기"
        className="h-8 w-8"
        onPress={onBack}
        size="icon"
        variant="ghost"
      >
        <Icon as={ArrowLeft} className="size-4 text-muted-foreground" />
      </Button>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold">{title}</Text>
        <Text className="truncate text-xs text-muted-foreground">
          {description}
        </Text>
      </View>
    </View>
  );
}
