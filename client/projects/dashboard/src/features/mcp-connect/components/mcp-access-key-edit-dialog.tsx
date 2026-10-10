import { useState } from 'react';
import { View } from 'react-native';

import {
  getMcpAccessKeysControllerListQueryKey,
  useMcpAccessKeysControllerRevoke,
  useMcpAccessKeysControllerUpdate,
} from '@repo/client/api-client';
import type {
  McpAccessKey,
  McpConnectionInfo,
} from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DIALOG_WIDTH } from '@core/app/ui/dialog-width';
import {
  ChoiceChip,
  type McpAccessKeyDraft,
  McpAccessKeyFields,
  validateMcpAccessKeyDraft,
} from '@core/features/mcp-connect/components/mcp-access-key-fields';

import { useQueryClient } from '@tanstack/react-query';

// 접근 키 하나의 이름·권한·조직·사용 여부 수정과 삭제를 한 곳에서 한다.
export function McpAccessKeyEditDialog({
  info,
  mcpKey,
  onClose,
}: {
  info: McpConnectionInfo;
  mcpKey: McpAccessKey;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const [draft, setDraft] = useState<McpAccessKeyDraft>({
    name: mcpKey.name,
    organizationGrant: mcpKey.organizationGrant,
    scopes: mcpKey.scopes,
  });
  const [enabled, setEnabled] = useState(mcpKey.enabled);
  const notifyMutationError = useMutationErrorNotification({
    fallback: '잠시 후 다시 시도해 주세요.',
    title: '접근 키를 바꾸지 못했습니다',
  });
  const update = useMcpAccessKeysControllerUpdate({
    mutation: { onError: notifyMutationError },
  });
  const revoke = useMcpAccessKeysControllerRevoke({
    mutation: { onError: notifyMutationError },
  });
  const busy = update.isPending || revoke.isPending;

  const refreshList = () =>
    queryClient.invalidateQueries({
      queryKey: getMcpAccessKeysControllerListQueryKey(),
    });

  const nameChanged = draft.name.trim() !== mcpKey.name;
  const scopesChanged = !sameItems(draft.scopes, mcpKey.scopes);
  const grantChanged = !sameGrant(
    draft.organizationGrant,
    mcpKey.organizationGrant,
  );
  const enabledChanged = enabled !== mcpKey.enabled;

  const save = async () => {
    if (!nameChanged && !scopesChanged && !grantChanged && !enabledChanged) {
      notifySuccess({ title: '변경 사항이 없습니다' });
      return;
    }
    const problem = validateMcpAccessKeyDraft(draft);
    if (problem) {
      notifyError({ title: problem });
      return;
    }
    try {
      await update.mutateAsync({
        keyId: mcpKey.id,
        data: {
          ...(nameChanged ? { name: draft.name.trim() } : {}),
          ...(scopesChanged ? { scopes: draft.scopes } : {}),
          ...(grantChanged
            ? { organizationGrant: draft.organizationGrant }
            : {}),
          ...(enabledChanged ? { enabled } : {}),
        },
      });
      await refreshList();
      notifySuccess({ title: '접근 키를 저장했습니다.' });
    } catch {
      // 오류 알림은 mutation onError에서 처리한다.
    }
  };

  const revokeKey = async () => {
    try {
      await revoke.mutateAsync({ keyId: mcpKey.id });
      await refreshList();
      notifySuccess({ title: '접근 키를 삭제했습니다.' });
      onClose();
    } catch {
      // 오류 알림은 mutation onError에서 처리한다.
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      open
    >
      <DialogContent className={cn('max-h-[90vh]', DIALOG_WIDTH.xl)}>
        <DialogHeader>
          <DialogTitle>접근 키 수정</DialogTitle>
        </DialogHeader>

        <View className="gap-4">
          <McpAccessKeyFields
            disabled={busy}
            draft={draft}
            info={info}
            onChange={setDraft}
          />
          <View className="gap-1.5">
            <Text className="text-xs font-medium">사용</Text>
            <View className="flex-row gap-2">
              <ChoiceChip
                disabled={busy}
                label="사용"
                onPress={() => setEnabled(true)}
                selected={enabled}
              />
              <ChoiceChip
                disabled={busy}
                label="끄기"
                onPress={() => setEnabled(false)}
                selected={!enabled}
              />
            </View>
          </View>
        </View>

        <DialogFooter className="sm:justify-between">
          <Button
            disabled={busy}
            onPress={() => void revokeKey()}
            variant="ghost"
          >
            <Text className="text-destructive">삭제</Text>
          </Button>
          <Button disabled={busy} onPress={() => void save()}>
            <Text className="text-primary-foreground">
              {update.isPending ? '저장 중...' : '저장'}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function sameItems(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length && left.every((item) => right.includes(item))
  );
}

function sameGrant(
  left: McpAccessKey['organizationGrant'],
  right: McpAccessKey['organizationGrant'],
) {
  if (left.mode === 'selected' && right.mode === 'selected')
    return sameItems(left.organizationIds, right.organizationIds);
  return left.mode === right.mode;
}
