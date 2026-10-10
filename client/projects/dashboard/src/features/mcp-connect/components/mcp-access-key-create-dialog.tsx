import { useState } from 'react';
import { View } from 'react-native';

import {
  getMcpAccessKeysControllerListQueryKey,
  useMcpAccessKeysControllerCreate,
} from '@repo/client/api-client';
import type { McpConnectionInfo } from '@repo/client/api-client/schemas';
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
import { ChoiceChip } from '@core/app/ui/choice-chip';
import { DIALOG_WIDTH } from '@core/app/ui/dialog-width';
import {
  type McpAccessKeyDraft,
  McpAccessKeyFields,
  validateMcpAccessKeyDraft,
} from '@core/features/mcp-connect/components/mcp-access-key-fields';
import { McpAccessKeySecretView } from '@core/features/mcp-connect/components/mcp-access-key-secret';
import { createMcpIdempotencyKey } from '@core/features/mcp-connect/mcp-connect-presentation';

import { useQueryClient } from '@tanstack/react-query';

const EXPIRY_DAY_OPTIONS = [30, 90, 365];

export function McpAccessKeyCreateDialog({
  info,
  onClose,
}: {
  info: McpConnectionInfo;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const [draft, setDraft] = useState<McpAccessKeyDraft>({
    name: '',
    organizationGrant: { mode: 'all-user-organizations' },
    scopes: info.scopes.filter((scope) => scope.endsWith(':read')),
  });
  const [expiresInDays, setExpiresInDays] = useState(
    info.accessKey.defaultExpiresInDays,
  );
  const [idempotencyKey, setIdempotencyKey] = useState(createMcpIdempotencyKey);
  const [secret, setSecret] = useState<string | null>(null);
  const notifyCreateError = useMutationErrorNotification({
    fallback: '입력값을 확인한 뒤 다시 시도해 주세요.',
    title: '접근 키를 만들지 못했습니다',
  });
  const create = useMcpAccessKeysControllerCreate({
    mutation: { onError: notifyCreateError },
    request: { headers: { 'Idempotency-Key': idempotencyKey } },
  });
  const expiryOptions = [
    ...new Set([
      ...EXPIRY_DAY_OPTIONS.filter(
        (days) => days <= info.accessKey.maxExpiresInDays,
      ),
      info.accessKey.defaultExpiresInDays,
    ]),
  ].sort((left, right) => left - right);

  const submit = async () => {
    const problem = validateMcpAccessKeyDraft(draft);
    if (problem) {
      notifyError({ title: problem });
      return;
    }
    try {
      const created = await create.mutateAsync({
        data: {
          expiresInDays,
          name: draft.name.trim(),
          organizationGrant: draft.organizationGrant,
          scopes: draft.scopes,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getMcpAccessKeysControllerListQueryKey(),
      });
      setSecret(created.secret);
      notifySuccess({ title: '접근 키를 만들었습니다.' });
    } catch {
      // 오류 알림은 mutation onError에서 처리한다. 다음 시도는 새 요청으로 보낸다.
      setIdempotencyKey(createMcpIdempotencyKey());
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && !create.isPending) onClose();
      }}
      open
    >
      <DialogContent className={cn('max-h-[90vh]', DIALOG_WIDTH.xl)}>
        <DialogHeader>
          <DialogTitle>
            {secret ? '접근 키 발급 완료' : '새 접근 키'}
          </DialogTitle>
        </DialogHeader>

        {secret ? (
          <McpAccessKeySecretView info={info} secret={secret} />
        ) : (
          <View className="gap-4">
            <McpAccessKeyFields
              disabled={create.isPending}
              draft={draft}
              info={info}
              onChange={setDraft}
            />
            <View className="gap-1.5">
              <Text className="text-xs font-medium">만료</Text>
              <View className="flex-row flex-wrap gap-2">
                {expiryOptions.map((days) => (
                  <ChoiceChip
                    disabled={create.isPending}
                    key={days}
                    label={`${days}일`}
                    onPress={() => setExpiresInDays(days)}
                    selected={expiresInDays === days}
                  />
                ))}
              </View>
            </View>
          </View>
        )}

        <DialogFooter>
          {secret ? (
            <Button onPress={onClose}>
              <Text className="text-primary-foreground">닫기</Text>
            </Button>
          ) : (
            <>
              <Button
                disabled={create.isPending}
                onPress={onClose}
                variant="outline"
              >
                <Text>취소</Text>
              </Button>
              <Button disabled={create.isPending} onPress={() => void submit()}>
                <Text className="text-primary-foreground">
                  {create.isPending ? '만드는 중...' : '만들기'}
                </Text>
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
