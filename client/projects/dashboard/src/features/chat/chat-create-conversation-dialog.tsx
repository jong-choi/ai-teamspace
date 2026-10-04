import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import {
  useChatControllerCreateChannel,
  useChatControllerCreateDirect,
} from '@monorepo-erp/api-client';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';

import { UserPlus, Users } from 'lucide-react-native';

type CreateConversationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
};

export function ChatCreateConversationDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateConversationDialogProps) {
  const [mode, setMode] = useState<'channel' | 'direct'>('channel');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [participantUsernames, setParticipantUsernames] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const notifyCreateError = useMutationErrorNotification({
    id: 'chat-create-conversation',
    title: '대화를 만들지 못했습니다',
    fallback: '잠시 후 다시 시도해 주세요.',
  });
  const createChannel = useChatControllerCreateChannel({
    mutation: { onError: notifyCreateError },
  });
  const createDirect = useChatControllerCreateDirect({
    mutation: { onError: notifyCreateError },
  });

  const pending = createChannel.isPending || createDirect.isPending;
  const canSubmit =
    mode === 'channel'
      ? name.trim().replace(/^#/, '').length > 0
      : recipientUsername.trim().length > 0;

  const reset = () => {
    setMode('channel');
    setName('');
    setTopic('');
    setParticipantUsernames('');
    setRecipientUsername('');
    createChannel.reset();
    createDirect.reset();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && pending) {
      return;
    }
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  const selectMode = (nextMode: 'channel' | 'direct') => {
    setMode(nextMode);
    if (nextMode === 'channel') {
      createDirect.reset();
    } else {
      createChannel.reset();
    }
  };

  const handleCreated = (id: string) => {
    onCreated(id);
    reset();
  };

  const submit = () => {
    if (mode === 'channel') {
      const channelName = name.trim().replace(/^#/, '');
      if (!channelName) {
        return;
      }

      createChannel.mutate(
        {
          data: {
            name: channelName,
            topic: topic.trim() || null,
            participantUsernames: participantUsernames
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
          },
        },
        {
          onSuccess: (response) => handleCreated(response.id),
        },
      );
      return;
    }

    const username = recipientUsername.trim();
    if (!username) {
      return;
    }
    createDirect.mutate(
      { data: { recipientUsername: username } },
      {
        onSuccess: (response) => handleCreated(response.id),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>새 대화 만들기</DialogTitle>
          <DialogDescription>
            채널을 만들거나 정확한 사용자 이름으로 다이렉트 메시지를 시작합니다.
          </DialogDescription>
        </DialogHeader>

        <View className="flex-row rounded-lg bg-muted p-1">
          <Pressable
            className={cn(
              'flex-1 items-center rounded-md px-3 py-2',
              mode === 'channel' && 'bg-background shadow-sm',
            )}
            disabled={pending}
            onPress={() => selectMode('channel')}
          >
            <View className="flex-row items-center gap-1.5">
              <Icon as={Users} className="size-3.5 text-muted-foreground" />
              <Text className="text-xs font-medium">채널</Text>
            </View>
          </Pressable>
          <Pressable
            className={cn(
              'flex-1 items-center rounded-md px-3 py-2',
              mode === 'direct' && 'bg-background shadow-sm',
            )}
            disabled={pending}
            onPress={() => selectMode('direct')}
          >
            <View className="flex-row items-center gap-1.5">
              <Icon as={UserPlus} className="size-3.5 text-muted-foreground" />
              <Text className="text-xs font-medium">다이렉트</Text>
            </View>
          </Pressable>
        </View>

        {mode === 'channel' ? (
          <View className="gap-3">
            <View className="gap-1.5">
              <Text className="text-xs font-medium">채널 이름</Text>
              <Input
                editable={!pending}
                onChangeText={setName}
                placeholder="예: frontend-release"
                value={name}
              />
            </View>
            <View className="gap-1.5">
              <Text className="text-xs font-medium">채널 설명 (선택)</Text>
              <Input
                editable={!pending}
                onChangeText={setTopic}
                placeholder="채널의 목적과 논의 주제"
                value={topic}
              />
            </View>
            <View className="gap-1.5">
              <Text className="text-xs font-medium">
                참여자 username (선택)
              </Text>
              <Input
                autoCapitalize="none"
                editable={!pending}
                onChangeText={setParticipantUsernames}
                placeholder="alice, bob"
                value={participantUsernames}
              />
              <Text className="text-[10px] text-muted-foreground">
                자동완성 없이 정확한 username을 쉼표로 구분합니다.
              </Text>
            </View>
          </View>
        ) : (
          <View className="gap-1.5">
            <Text className="text-xs font-medium">상대방 username</Text>
            <Input
              autoCapitalize="none"
              editable={!pending}
              onChangeText={setRecipientUsername}
              placeholder="exact.username"
              value={recipientUsername}
            />
            <Text className="text-[10px] text-muted-foreground">
              사용자 검색이나 자동완성 없이 정확히 입력합니다.
            </Text>
          </View>
        )}

        <DialogFooter>
          <Button
            disabled={pending}
            onPress={() => handleOpenChange(false)}
            variant="outline"
          >
            <Text>취소</Text>
          </Button>
          <Button disabled={!canSubmit || pending} onPress={submit}>
            {pending ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text className="text-primary-foreground">
                {mode === 'channel' ? '채널 만들기' : '대화 시작'}
              </Text>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
