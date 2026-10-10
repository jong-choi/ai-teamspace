import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import {
  useChatControllerCreateChannel,
  useChatControllerCreateDirect,
  useOrganizationsControllerGetActiveSuspense,
} from '@repo/client/api-client';
import type { OrganizationUserSummary } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import { DashboardInput } from '@core/app/ui/dashboard-input';
import { DIALOG_WIDTH } from '@core/app/ui/dialog-width';
import {
  OrganizationMemberAvatar,
  OrganizationMemberSearch,
} from '@core/features/organizations/organization-member-search';

import { UserPlus, Users, X } from 'lucide-react-native';

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
  const [participants, setParticipants] = useState<SelectedParticipant[]>([]);
  const [recipient, setRecipient] = useState<SelectedParticipant | null>(null);
  const { currentUserId } = useDashboardPlatform();
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
      : recipient !== null;

  const reset = () => {
    setMode('channel');
    setName('');
    setTopic('');
    setParticipants([]);
    setRecipient(null);
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
            participantUserIds: participants.flatMap((participant) =>
              'member' in participant ? [participant.member.id] : [],
            ),
            participantUsernames: participants.flatMap((participant) =>
              'username' in participant ? [participant.username] : [],
            ),
          },
        },
        {
          onSuccess: (response) => handleCreated(response.id),
        },
      );
      return;
    }

    if (!recipient) {
      return;
    }
    createDirect.mutate(
      {
        data:
          'member' in recipient
            ? { recipientUserId: recipient.member.id }
            : { recipientUsername: recipient.username },
      },
      {
        onSuccess: (response) => handleCreated(response.id),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={DIALOG_WIDTH.md}>
        <DialogHeader>
          <DialogTitle>새 대화 만들기</DialogTitle>
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

        {/* 멤버 검색 결과가 뒤따르는 입력과 footer 위에 뜨도록 z-index를 올린다. */}
        {mode === 'channel' ? (
          <View className="z-10 gap-3">
            <View className="gap-1.5">
              <Text className="text-xs font-medium">채널 이름</Text>
              <DashboardInput
                editable={!pending}
                onChangeText={setName}
                placeholder="예: frontend-release"
                value={name}
              />
            </View>
            <View className="gap-1.5">
              <Text className="text-xs font-medium">채널 설명</Text>
              <DashboardInput
                editable={!pending}
                onChangeText={setTopic}
                placeholder="채널의 목적과 논의 주제"
                value={topic}
              />
            </View>
            <View className="z-10 gap-1.5">
              <Text className="text-xs font-medium">참여자</Text>
              {participants.length > 0 ? (
                <View className="flex-row flex-wrap gap-1.5">
                  {participants.map((participant) => (
                    <SelectedParticipantChip
                      key={participantKey(participant)}
                      onRemove={() =>
                        setParticipants((current) =>
                          current.filter(
                            (candidate) =>
                              participantKey(candidate) !==
                              participantKey(participant),
                          ),
                        )
                      }
                      participant={participant}
                    />
                  ))}
                </View>
              ) : null}
              <ParticipantSearch
                accessibilityLabel="참여자 검색"
                disabled={pending}
                excludedUserIds={[
                  ...(currentUserId ? [currentUserId] : []),
                  ...participants.flatMap((participant) =>
                    'member' in participant ? [participant.member.id] : [],
                  ),
                ]}
                onSelect={(participant) =>
                  setParticipants((current) =>
                    current.some(
                      (candidate) =>
                        participantKey(candidate) ===
                        participantKey(participant),
                    )
                      ? current
                      : [...current, participant],
                  )
                }
                selectLabel={(name) => `${name} 참여자로 추가`}
              />
            </View>
          </View>
        ) : (
          <View className="z-10 gap-1.5">
            <Text className="text-xs font-medium">상대방</Text>
            {recipient ? (
              <View className="h-8 flex-row items-center">
                <SelectedParticipantChip
                  onRemove={() => setRecipient(null)}
                  participant={recipient}
                />
              </View>
            ) : (
              <ParticipantSearch
                accessibilityLabel="상대방 검색"
                disabled={pending}
                excludedUserIds={currentUserId ? [currentUserId] : []}
                onSelect={setRecipient}
                selectLabel={(name) => `${name}에게 메시지 보내기`}
              />
            )}
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

// 조직 멤버는 검색해서 고르고, 조직 밖 사용자는 결과가 없을 때 나오는 "직접 입력"으로 사용자명을 그대로 쓴다.
type SelectedParticipant =
  { member: OrganizationUserSummary } | { username: string };

function participantKey(participant: SelectedParticipant): string {
  return 'member' in participant
    ? `member:${participant.member.id}`
    : `username:${participant.username.toLowerCase()}`;
}

type ParticipantSearchProps = {
  accessibilityLabel: string;
  disabled: boolean;
  excludedUserIds: readonly string[];
  onSelect: (participant: SelectedParticipant) => void;
  selectLabel: (name: string) => string;
};

function ParticipantSearch(props: ParticipantSearchProps) {
  return (
    <DashboardQueryBoundary
      fallback={<UsernameOnlyInput {...props} />}
      title="조직 멤버 검색을 불러오지 못했습니다"
    >
      <ResolvedParticipantSearch {...props} />
    </DashboardQueryBoundary>
  );
}

function ResolvedParticipantSearch(props: ParticipantSearchProps) {
  const organizationId =
    useOrganizationsControllerGetActiveSuspense().data.activeOrganization
      ?.organization.id;
  if (!organizationId) return <UsernameOnlyInput {...props} />;
  return (
    <OrganizationMemberSearch
      accessibilityLabel={props.accessibilityLabel}
      disabled={props.disabled}
      excludedUserIds={props.excludedUserIds}
      floating
      onSelect={(member) => props.onSelect({ member: member.user })}
      onUseTypedValue={(username) => props.onSelect({ username })}
      organizationId={organizationId}
      placeholder="이름·이메일로 검색하거나 사용자명 입력..."
      selectLabel={props.selectLabel}
    />
  );
}

// 활성 조직이 없으면 검색할 멤버가 없으므로 사용자명을 입력하고 Enter로 추가한다.
function UsernameOnlyInput({
  accessibilityLabel,
  disabled,
  onSelect,
}: ParticipantSearchProps) {
  const [username, setUsername] = useState('');
  return (
    <DashboardInput
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="none"
      editable={!disabled}
      onChangeText={setUsername}
      onSubmitEditing={() => {
        const trimmed = username.trim();
        if (!trimmed) return;
        onSelect({ username: trimmed });
        setUsername('');
      }}
      placeholder="사용자명 입력 후 Enter"
      value={username}
    />
  );
}

function SelectedParticipantChip({
  onRemove,
  participant,
}: {
  onRemove: () => void;
  participant: SelectedParticipant;
}) {
  const label =
    'member' in participant
      ? participant.member.name
      : `@${participant.username}`;
  return (
    <Pressable
      accessibilityLabel={`${label} 선택 해제`}
      className="flex-row items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1"
      onPress={onRemove}
    >
      {'member' in participant ? (
        <OrganizationMemberAvatar
          compact
          image={participant.member.image}
          name={participant.member.name}
        />
      ) : null}
      <Text className="text-2xs font-medium">{label}</Text>
      <Icon as={X} className="size-3 text-muted-foreground" />
    </Pressable>
  );
}
