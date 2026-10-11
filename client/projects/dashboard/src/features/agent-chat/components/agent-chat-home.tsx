import { Pressable, View } from 'react-native';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';

import { Bot } from 'lucide-react-native';

const examplePrompts = [
  '이번 주 내 회의 일정을 정리해 줘',
  '진행 중인 프로젝트 티켓 현황을 알려 줘',
  '위키에서 온보딩 문서를 찾아 줘',
];

export function AgentChatHome({
  onPickPrompt,
}: {
  onPickPrompt: (prompt: string) => void;
}) {
  return (
    <View className="min-h-0 flex-1 items-center justify-center px-5">
      <View className="w-full max-w-md items-center gap-3">
        <View className="size-11 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10">
          <Icon
            as={Bot}
            className="size-5 text-violet-600 dark:text-violet-400"
          />
        </View>
        <Text className="text-lg font-semibold tracking-tight">
          AI Teamspace Agent
        </Text>
        <View className="mt-2 w-full gap-1.5">
          {examplePrompts.map((prompt) => (
            <Pressable
              accessibilityRole="button"
              className="rounded-lg border border-border/70 px-3 py-2 web:hover:bg-accent/60"
              key={prompt}
              onPress={() => onPickPrompt(prompt)}
            >
              <Text className="text-xs text-muted-foreground">{prompt}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
