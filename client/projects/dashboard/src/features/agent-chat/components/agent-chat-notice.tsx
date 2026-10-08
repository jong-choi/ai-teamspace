import { View } from 'react-native';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@repo/client/rnr/components/ui/alert';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';

import { CircleAlert, Info } from 'lucide-react-native';

// 채팅 패널 안에서만 보이는 상태 안내다. 업무 화면이나 공통 헤더를 가리지 않는다.
export function AgentChatNotice({
  action,
  description,
  title,
  variant = 'default',
}: {
  action?: { label: string; onPress: () => void };
  description: string;
  title: string;
  variant?: 'default' | 'destructive';
}) {
  return (
    <Alert
      icon={variant === 'destructive' ? CircleAlert : Info}
      variant={variant}
    >
      <AlertTitle className="text-xs">{title}</AlertTitle>
      <AlertDescription className="text-xs leading-5">
        {description}
      </AlertDescription>
      {action ? (
        <View className="items-start pb-1.5 pl-6">
          <Button onPress={action.onPress} size="sm" variant="outline">
            <Text className="text-xs">{action.label}</Text>
          </Button>
        </View>
      ) : null}
    </Alert>
  );
}

export function AgentChatCenteredNotice(
  props: React.ComponentProps<typeof AgentChatNotice>,
) {
  return (
    <View className="flex-1 justify-center px-4">
      <AgentChatNotice {...props} />
    </View>
  );
}
