import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Separator } from '@repo/client/rnr/components/ui/separator';
import { Text } from '@repo/client/rnr/components/ui/text';

import { Send, Square } from 'lucide-react-native';

export function AgentChatComposer({
  busy,
  disabled = false,
  onStop,
  onSubmit,
  stopping = false,
}: {
  busy: boolean;
  disabled?: boolean;
  onStop?: () => void;
  onSubmit: (message: string) => Promise<boolean>;
  stopping?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const blocked = busy || disabled || submitting;

  const submit = async () => {
    const message = draft.trim();
    if (!message || blocked) return;

    setSubmitting(true);
    try {
      if (await onSubmit(message)) setDraft('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="shrink-0 border-t border-border bg-background p-3 sm:p-4">
      <View className="rounded-xl border border-border bg-muted/30 shadow-none">
        <Input
          accessibilityLabel="AI에게 보낼 메시지"
          className="min-h-16 border-0 bg-transparent px-3.5 py-2.5 text-xs shadow-none web:focus-visible:ring-0"
          editable={!blocked}
          multiline
          onChangeText={setDraft}
          onSubmitEditing={() => void submit()}
          placeholder="Work OS에 대해 물어보거나 작업을 요청하세요..."
          submitBehavior="submit"
          value={draft}
        />
        <Separator />
        <View className="flex-row items-center justify-between px-3 py-2">
          <Text className="hidden text-[10px] text-muted-foreground sm:flex">
            Enter 전송 · 실행 중에는 중지할 수 있습니다
          </Text>
          <View className="ml-auto">
            {busy ? (
              onStop ? (
                <Button
                  accessibilityLabel={
                    stopping ? 'Agent 실행 중지 중' : 'Agent 실행 중지'
                  }
                  className="h-8 gap-1.5 px-3"
                  disabled={stopping}
                  onPress={onStop}
                  size="sm"
                  variant="outline"
                >
                  {stopping ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Icon as={Square} className="size-3" />
                  )}
                  <Text className="text-xs">
                    {stopping ? '중지 중...' : '중지'}
                  </Text>
                </Button>
              ) : (
                <Button
                  accessibilityLabel="Agent 대화 준비 중"
                  className="h-8 gap-1.5 px-3"
                  disabled
                  size="sm"
                >
                  <ActivityIndicator size="small" />
                  <Text className="text-xs text-primary-foreground">
                    준비 중
                  </Text>
                </Button>
              )
            ) : (
              <Button
                accessibilityLabel="AI에게 메시지 보내기"
                className="h-8 gap-1.5 px-3"
                disabled={!draft.trim() || submitting}
                onPress={() => void submit()}
                size="sm"
              >
                {submitting ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <>
                    <Text className="text-xs text-primary-foreground">
                      전송
                    </Text>
                    <Icon
                      as={Send}
                      className="size-3 text-primary-foreground"
                    />
                  </>
                )}
              </Button>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
