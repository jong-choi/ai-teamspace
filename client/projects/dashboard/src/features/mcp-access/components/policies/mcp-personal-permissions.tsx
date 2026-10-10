import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import type { McpAccessComposite } from '@repo/client/api-client/schemas';
import { Text } from '@repo/client/rnr/components/ui/text';
import { McpPermissionTable } from '@core/features/mcp-access/components/policies/mcp-permission-table';
import {
  countChangedScopes,
  McpPolicySaveBar,
} from '@core/features/mcp-access/components/policies/mcp-policy-save-bar';
import { useMcpAccessMutations } from '@core/features/mcp-access/mcp-access-mutations';
import {
  isPersonalMcpScope,
  MCP_ORGANIZATION_ROWS,
  MCP_PERSONAL_ROWS,
  type McpAccessScope,
} from '@core/features/mcp-access/mcp-access-presentation';

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

  const availableScopes = access.capabilities.map(({ scope }) => scope);

  return (
    <View className="gap-3">
      <View className="gap-1.5">
        <Text className="text-xs text-muted-foreground">
          조직 업무 · 조직 AI 정책이 허용한 범위에서 고릅니다
        </Text>
        <McpPermissionTable
          availableScopes={availableScopes}
          disabled={updateMyPolicy.isPending}
          lockedScopes={access.capabilities
            .filter(
              (capability) =>
                !capability.organizationAllowed &&
                !isPersonalMcpScope(capability.scope),
            )
            .map(({ scope }) => scope)}
          onToggle={toggleScope}
          rows={MCP_ORGANIZATION_ROWS}
          selectedScopes={selectedScopes}
        />
      </View>
      <View className="gap-1.5">
        <Text className="text-xs text-muted-foreground">
          내 채팅 · 조직 정책과 상관없이 나만 설정합니다
        </Text>
        <McpPermissionTable
          availableScopes={availableScopes}
          disabled={updateMyPolicy.isPending}
          onToggle={toggleScope}
          rows={MCP_PERSONAL_ROWS}
          selectedScopes={selectedScopes}
        />
      </View>
      <McpPolicySaveBar
        changedCount={countChangedScopes(
          access.myPolicy.requestedScopes,
          selectedScopes,
        )}
        onSave={() => void submit()}
        pending={updateMyPolicy.isPending}
      />
    </View>
  );
}
