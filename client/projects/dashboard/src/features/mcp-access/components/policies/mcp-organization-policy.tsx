import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';
import { McpPermissionList } from '@core/features/mcp-access/components/policies/mcp-permission-list';
import type {
  McpAccessComposite,
  McpAccessScope,
} from '@core/features/mcp-access/mcp-access-contract';
import { useMcpAccessMutations } from '@core/features/mcp-access/mcp-access-mutations';

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
  const removedScopes = useMemo(
    () =>
      access.organizationPolicy.allowedScopes.filter(
        (scope) => !selectedScopes.includes(scope),
      ),
    [access.organizationPolicy.allowedScopes, selectedScopes],
  );

  useEffect(() => {
    if (!form.formState.isDirty) {
      form.reset({
        allowedScopes: access.organizationPolicy.allowedScopes,
      });
      setConfirmShrink(false);
    }
  }, [
    access.organizationPolicy.allowedScopes,
    access.organizationPolicy.revision,
    form,
    form.formState.isDirty,
  ]);

  if (!access.canManageOrganizationPolicy) {
    return (
      <View className="gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
        <Text className="text-base font-semibold">조직 MCP 정책</Text>
        <Text className="text-xs text-muted-foreground">
          조직 관리자만 조직 전체의 MCP 허용 범위를 변경할 수 있습니다.
        </Text>
      </View>
    );
  }

  const toggleScope = (scope: McpAccessScope) => {
    setConfirmShrink(false);
    const current = form.getValues('allowedScopes');
    const next = current.includes(scope)
      ? current.filter((candidate) => candidate !== scope)
      : [...current, scope];

    form.setValue('allowedScopes', next, {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const save = async (values: OrganizationPolicyForm) => {
    try {
      const result = await updateOrganizationPolicy.mutateAsync({
        scopes: values.allowedScopes,
        expectedRevision: access.organizationPolicy.revision,
      });
      form.reset({
        allowedScopes: result.organizationPolicy.allowedScopes,
      });
      setConfirmShrink(false);
    } catch (error) {
      await handleError(
        error,
        '최신 조직 정책과 관리자 권한을 확인한 뒤 다시 시도해 주세요.',
      );
    }
  };

  const submit = form.handleSubmit(async (values) => {
    if (removedScopes.length > 0 && !confirmShrink) {
      setConfirmShrink(true);
      return;
    }
    await save(values);
  });

  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <View>
        <Text className="text-base font-semibold">조직 MCP 정책</Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          조직 전체에서 허용 가능한 최대 범위입니다. 사용자는 이 범위를 넘어
          권한을 요청할 수 없습니다.
        </Text>
      </View>

      <McpPermissionList
        capabilities={access.capabilities}
        disabled={updateOrganizationPolicy.isPending}
        mode="organization"
        onToggle={toggleScope}
        selectedScopes={selectedScopes}
      />

      {confirmShrink && removedScopes.length > 0 ? (
        <View className="gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <Text className="text-sm font-semibold">조직 권한 축소 확인</Text>
          <Text className="text-xs text-muted-foreground">
            {removedScopes.length}개 capability를 제거합니다. 모든 사용자의 요청
            범위에서도 즉시 제거되며 기존 credential도 이 범위를 사용할 수
            없습니다. 나중에 조직 권한을 다시 켜도 사용자 요청 권한은 자동으로
            복원되지 않습니다.
          </Text>
          <View className="flex-row justify-end gap-2">
            <Button
              onPress={() => setConfirmShrink(false)}
              size="sm"
              variant="outline"
            >
              <Text>취소</Text>
            </Button>
            <Button
              disabled={updateOrganizationPolicy.isPending}
              onPress={() => void save(form.getValues())}
              size="sm"
            >
              <Text className="text-primary-foreground">
                {updateOrganizationPolicy.isPending
                  ? '저장 중...'
                  : '축소 적용'}
              </Text>
            </Button>
          </View>
        </View>
      ) : null}

      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[11px] text-muted-foreground">
          revision {access.organizationPolicy.revision}
        </Text>
        <Button
          disabled={
            !form.formState.isDirty || updateOrganizationPolicy.isPending
          }
          onPress={() => void submit()}
          size="sm"
        >
          <Text className="text-primary-foreground">조직 정책 저장</Text>
        </Button>
      </View>
    </View>
  );
}
