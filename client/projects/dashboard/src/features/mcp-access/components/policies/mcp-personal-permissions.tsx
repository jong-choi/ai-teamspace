import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import type { McpAccessComposite } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';
import { McpPermissionList } from '@core/features/mcp-access/components/policies/mcp-permission-list';
import type { McpAccessScope } from '@core/features/mcp-access/mcp-access-presentation';
import { useMcpAccessMutations } from '@core/features/mcp-access/mcp-access-mutations';

type PersonalPolicyForm = {
  requestedScopes: McpAccessScope[];
};

export function McpPersonalPermissions({
  access,
}: {
  access: McpAccessComposite;
}) {
  const { updateMyPolicy, handleError } = useMcpAccessMutations(
    access.organizationId,
  );
  const form = useForm<PersonalPolicyForm>({
    defaultValues: { requestedScopes: access.myPolicy.requestedScopes },
  });
  const selectedScopes = form.watch('requestedScopes');

  useEffect(() => {
    if (!form.formState.isDirty) {
      form.reset({ requestedScopes: access.myPolicy.requestedScopes });
    }
  }, [
    access.myPolicy.requestedScopes,
    access.myPolicy.revision,
    form,
    form.formState.isDirty,
  ]);

  const toggleScope = (scope: McpAccessScope) => {
    const current = form.getValues('requestedScopes');
    const next = current.includes(scope)
      ? current.filter((candidate) => candidate !== scope)
      : [...current, scope];

    form.setValue('requestedScopes', next, {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      const result = await updateMyPolicy.mutateAsync({
        organizationId: access.organizationId,
        data: {
          requestedScopes: values.requestedScopes,
          expectedRevision: access.myPolicy.revision,
        },
      });
      form.reset({ requestedScopes: result.myPolicy.requestedScopes });
    } catch (error) {
      await handleError(
        error,
        '조직 정책과 현재 권한을 확인한 뒤 다시 시도해 주세요.',
      );
    }
  });

  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <View>
        <Text className="text-base font-semibold">내 Agent 권한</Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          조직이 허용한 범위 안에서 Agent가 나를 대신해 사용할 capability를
          선택합니다. 변경 권한은 기본적으로 꺼져 있습니다.
        </Text>
      </View>

      <McpPermissionList
        capabilities={access.capabilities}
        disabled={updateMyPolicy.isPending}
        mode="personal"
        onToggle={toggleScope}
        selectedScopes={selectedScopes}
      />

      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[11px] text-muted-foreground">
          revision {access.myPolicy.revision}
        </Text>
        <Button
          disabled={!form.formState.isDirty || updateMyPolicy.isPending}
          onPress={() => void submit()}
          size="sm"
        >
          <Text className="text-primary-foreground">
            {updateMyPolicy.isPending ? '저장 중...' : '내 권한 저장'}
          </Text>
        </Button>
      </View>
    </View>
  );
}
