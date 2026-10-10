import { type ReactNode, useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  useUserProfileControllerRemoveAvatar,
  useUserProfileControllerReplaceAvatar,
} from '@repo/client/api-client';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { SettingsRouteFrame } from '@core/features/settings/settings-route-frame';

const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,30}$/;

export function AccountRoute() {
  return (
    <SettingsRouteFrame
      activeTab="account"
      userContent={() => <AccountPage />}
    />
  );
}

function AccountPage() {
  return (
    <ScrollView
      className="min-h-0 flex-1"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className="mx-auto w-full max-w-7xl gap-3 p-4 sm:p-6 lg:p-8">
        <AccountForm />
      </View>
    </ScrollView>
  );
}

// 고른 사진과 바꾼 이름·사용자명은 저장을 눌러야 반영된다.
type AvatarDraft =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'replace'; file: Blob; previewUri: string };

function AccountForm() {
  const {
    authentication,
    currentUser,
    currentUsername,
    notifyError,
    notifySuccess,
    pickImageFile,
    refreshSession,
  } = useDashboardPlatform();
  const notifyAvatarError = useMutationErrorNotification({
    fallback: 'PNG, JPEG, WebP 이미지를 5MB 이하로 올려 주세요.',
    title: '프로필 사진을 저장하지 못했습니다',
  });
  const replaceAvatar = useUserProfileControllerReplaceAvatar({
    mutation: { onError: notifyAvatarError },
  });
  const removeAvatar = useUserProfileControllerRemoveAvatar({
    mutation: { onError: notifyAvatarError },
  });
  const savedName = currentUser?.name ?? '';
  const savedUsername = currentUsername ?? '';
  // 입력 중인 값만 state로 두고, 손대지 않은 칸은 session 값을 그대로 따른다.
  const [draft, setDraft] = useState<{ name?: string; username?: string }>({});
  const [avatar, setAvatar] = useState<AvatarDraft>({ kind: 'keep' });
  const [pending, setPending] = useState(false);
  const name = draft.name ?? savedName;
  const username = draft.username ?? savedUsername;
  const nameChanged = name.trim() !== savedName;
  const usernameChanged = username.trim() !== savedUsername;
  const avatarChanged =
    avatar.kind === 'replace' ||
    (avatar.kind === 'remove' && Boolean(currentUser?.image));
  const usernameValid =
    !usernameChanged || USERNAME_PATTERN.test(username.trim());
  const shownImage =
    avatar.kind === 'replace'
      ? avatar.previewUri
      : avatar.kind === 'remove'
        ? null
        : (currentUser?.image ?? null);

  const chooseAvatar = async () => {
    try {
      const file = await pickImageFile();
      if (file)
        setAvatar({
          kind: 'replace',
          file,
          previewUri: URL.createObjectURL(file),
        });
    } catch (error) {
      notifyError({
        title: '사진을 고를 수 없습니다',
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const save = async () => {
    if (pending) return;
    if (!nameChanged && !usernameChanged && !avatarChanged) {
      notifySuccess({ title: '변경 사항이 없습니다' });
      return;
    }
    if (name.trim().length === 0) {
      notifyError({ title: '이름을 입력해 주세요' });
      return;
    }
    if (!usernameValid) {
      notifyError({
        title: '사용자명을 확인해 주세요',
        description: '영문, 숫자, 밑줄, 마침표로 3~30자를 입력해 주세요.',
      });
      return;
    }

    setPending(true);
    try {
      if (avatar.kind === 'replace') {
        await replaceAvatar.mutateAsync({ data: avatar.file });
      } else if (avatarChanged) {
        await removeAvatar.mutateAsync();
      }
      if (nameChanged || usernameChanged) {
        const result = await authentication.updateUser({
          ...(nameChanged ? { name: name.trim() } : {}),
          ...(usernameChanged ? { username: username.trim() } : {}),
        });
        if (result.error) {
          notifyError({
            title: '계정 정보를 저장하지 못했습니다',
            description:
              result.error.message ?? '이미 쓰이는 사용자명일 수 있습니다.',
          });
          return;
        }
      }
      setDraft({});
      setAvatar({ kind: 'keep' });
      notifySuccess({ title: '계정 정보를 저장했습니다.' });
    } catch {
      // 사진 저장 오류 알림은 mutation onError에서 처리한다.
    } finally {
      // 일부만 저장된 경우에도 화면이 실제 계정 상태를 따르게 한다.
      await refreshSession();
      setPending(false);
    }
  };

  return (
    <>
      <View className="overflow-hidden rounded-lg border border-border">
        <AccountRow label="프로필 사진">
          <Avatar alt={name} className="size-9">
            {shownImage ? <AvatarImage source={{ uri: shownImage }} /> : null}
            <AvatarFallback>
              <Text className="text-xs font-semibold">
                {name.trim().slice(0, 1).toUpperCase() || '?'}
              </Text>
            </AvatarFallback>
          </Avatar>
          <Button
            disabled={pending}
            onPress={() => void chooseAvatar()}
            size="sm"
            variant="outline"
          >
            <Text className="text-xs">사진 변경</Text>
          </Button>
          {shownImage ? (
            <Button
              disabled={pending}
              onPress={() => setAvatar({ kind: 'remove' })}
              size="sm"
              variant="ghost"
            >
              <Text className="text-xs text-muted-foreground">삭제</Text>
            </Button>
          ) : null}
        </AccountRow>
        <AccountRow label="이름">
          <Input
            accessibilityLabel="이름"
            className="h-8 max-w-xs flex-1 text-xs md:text-xs"
            editable={!pending}
            maxLength={100}
            onChangeText={(value) =>
              setDraft((current) => ({ ...current, name: value }))
            }
            value={name}
          />
        </AccountRow>
        <AccountRow label="사용자명">
          <Input
            accessibilityLabel="사용자명"
            aria-invalid={!usernameValid}
            autoCapitalize="none"
            autoCorrect={false}
            className="h-8 max-w-xs flex-1 text-xs md:text-xs"
            editable={!pending}
            maxLength={30}
            onChangeText={(value) =>
              setDraft((current) => ({ ...current, username: value }))
            }
            placeholder="영문, 숫자, 밑줄, 마침표 3~30자"
            value={username}
          />
        </AccountRow>
        <AccountRow label="이메일">
          <Text className="text-xs text-muted-foreground">
            {currentUser?.email}
          </Text>
        </AccountRow>
      </View>
      <View className="flex-row justify-end">
        <Button disabled={pending} onPress={() => void save()} size="sm">
          <Text className="text-xs text-primary-foreground">
            {pending ? '저장 중...' : '저장'}
          </Text>
        </Button>
      </View>
    </>
  );
}

// 왼쪽 이름, 오른쪽 값·컨트롤로 이루어진 설정 한 줄이다.
function AccountRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <View className="min-h-11 flex-row items-center gap-3 border-t border-border/70 px-3 py-1.5 first:border-t-0">
      <Text className="w-20 shrink-0 text-xs font-medium">{label}</Text>
      <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-2">
        {children}
      </View>
    </View>
  );
}
