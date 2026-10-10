import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import type { McpAccessComposite } from '@repo/client/api-client/schemas';
import { McpPermissionTable } from '@core/features/mcp-access/components/policies/mcp-permission-table';
import {
  countChangedScopes,
  McpPolicySaveBar,
} from '@core/features/mcp-access/components/policies/mcp-policy-save-bar';
import { useMcpAccessMutations } from '@core/features/mcp-access/mcp-access-mutations';
import type { McpAccessScope } from '@core/features/mcp-access/mcp-access-presentation';

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
    <View className="gap-3">
      <McpPermissionTable
        capabilities={access.capabilities}
        disabled={updateMyPolicy.isPending}
        mode="personal"
        onToggle={toggleScope}
        selectedScopes={selectedScopes}
      />
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
