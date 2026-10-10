import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import type { McpAccessComposite } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Text } from '@repo/client/rnr/components/ui/text';
import { DIALOG_WIDTH } from '@core/app/ui/dialog-width';
import { McpPermissionTable } from '@core/features/mcp-access/components/policies/mcp-permission-table';
import {
  countChangedScopes,
  McpPolicySaveBar,
} from '@core/features/mcp-access/components/policies/mcp-policy-save-bar';
import { useMcpAccessMutations } from '@core/features/mcp-access/mcp-access-mutations';
import type { McpAccessScope } from '@core/features/mcp-access/mcp-access-presentation';

type OrganizationPolicyForm = {
  allowedScopes: McpAccessScope[];
};

export function McpOrganizationPolicy({
  access,
}: {
  access: McpAccessComposite;
}) {
  const { updateOrganizationPolicy, handleError } = useMcpAccessMutations(
    access.organizationId,
  );
  const form = useForm<OrganizationPolicyForm>({
    defaultValues: {
      allowedScopes: access.organizationPolicy.allowedScopes,
    },
  });
  const [confirmShrink, setConfirmShrink] = useState(false);
  const selectedScopes = form.watch('allowedScopes');
  const savedScopes = access.organizationPolicy.allowedScopes;
  const removedCount = savedScopes.filter(
    (scope) => !selectedScopes.includes(scope),
  ).length;
  const canManage = access.canManageOrganizationPolicy;

  useEffect(() => {
    if (!form.formState.isDirty) {
      form.reset({
        allowedScopes: access.organizationPolicy.allowedScopes,
      });
    }
  }, [
    access.organizationPolicy.allowedScopes,
    access.organizationPolicy.revision,
    form,
    form.formState.isDirty,
  ]);

  const toggleScope = (scope: McpAccessScope) => {
    const current = form.getValues('allowedScopes');
    const next = current.includes(scope)
      ? current.filter((candidate) => candidate !== scope)
      : [...current, scope];

    form.setValue('allowedScopes', next, {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const save = form.handleSubmit(async (values) => {
    try {
      const result = await updateOrganizationPolicy.mutateAsync({
        organizationId: access.organizationId,
        data: {
          allowedScopes: values.allowedScopes,
          expectedRevision: access.organizationPolicy.revision,
        },
      });
      form.reset({
        allowedScopes: result.organizationPolicy.allowedScopes,
      });
    } catch (error) {
      await handleError(
        error,
        '최신 조직 정책과 관리자 권한을 확인한 뒤 다시 시도해 주세요.',
      );
    } finally {
      setConfirmShrink(false);
    }
  });

  return (
    <View className="gap-3">
      <McpPermissionTable
        availableScopes={access.capabilities.map(({ scope }) => scope)}
        disabled={!canManage || updateOrganizationPolicy.isPending}
        onToggle={toggleScope}
        selectedScopes={selectedScopes}
      />
      {canManage ? (
        <McpPolicySaveBar
          changedCount={countChangedScopes(savedScopes, selectedScopes)}
          // 권한을 줄이는 저장은 되돌릴 수 없는 영향이 있어 한 번 더 확인한다.
          onSave={() =>
            removedCount > 0 ? setConfirmShrink(true) : void save()
          }
          pending={updateOrganizationPolicy.isPending}
        />
      ) : (
        <Text className="text-[11px] text-muted-foreground">
          조직 관리자만 변경할 수 있습니다.
        </Text>
      )}

      {confirmShrink ? (
        <Dialog
          onOpenChange={(open) => {
            if (!open && !updateOrganizationPolicy.isPending)
              setConfirmShrink(false);
          }}
          open
        >
          <DialogContent className={DIALOG_WIDTH.md}>
            <DialogHeader>
              <DialogTitle>
                권한 {removedCount}개를 조직에서 막을까요?
              </DialogTitle>
              <DialogDescription>
                모든 멤버의 권한에서 즉시 빠집니다. 나중에 다시 허용해도 멤버가
                골라 둔 권한은 자동으로 돌아오지 않습니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                disabled={updateOrganizationPolicy.isPending}
                onPress={() => setConfirmShrink(false)}
                variant="outline"
              >
                <Text>취소</Text>
              </Button>
              <Button
                disabled={updateOrganizationPolicy.isPending}
                onPress={() => void save()}
                variant="destructive"
              >
                <Text>
                  {updateOrganizationPolicy.isPending ? '저장 중...' : '막기'}
                </Text>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </View>
  );
}
