import { Pressable, View } from 'react-native';

import { useOrganizationsControllerListSuspense } from '@repo/client/api-client';
import type {
  McpAccessKey,
  McpConnectionInfo,
} from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Label } from '@repo/client/rnr/components/ui/label';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { ChoiceChip } from '@core/app/ui/choice-chip';
import { DashboardInput } from '@core/app/ui/dashboard-input';
import { McpPermissionTable } from '@core/features/mcp-access/components/policies/mcp-permission-table';
import type { McpAccessScope } from '@core/features/mcp-access/mcp-access-presentation';
import { MCP_DOMAIN_ROWS } from '@core/features/mcp-access/mcp-access-presentation';

import { Check } from 'lucide-react-native';

export type McpAccessKeyDraft = {
  name: string;
  organizationGrant: McpAccessKey['organizationGrant'];
  scopes: McpAccessScope[];
};

// 접근 키의 이름·권한·조직을 고르는 공통 입력이다. 발급과 수정 dialog가 같이 쓴다.
export function McpAccessKeyFields({
  disabled,
  draft,
  info,
  onChange,
}: {
  disabled: boolean;
  draft: McpAccessKeyDraft;
  info: McpConnectionInfo;
  onChange: (draft: McpAccessKeyDraft) => void;
}) {
  const allOrganizations =
    draft.organizationGrant.mode === 'all-user-organizations';

  return (
    <View className="gap-4">
      <View className="gap-1.5">
        <Label className="text-xs" nativeID="mcp-access-key-name">
          이름
        </Label>
        <DashboardInput
          accessibilityLabel="접근 키 이름"
          editable={!disabled}
          maxLength={32}
          onChangeText={(name) => onChange({ ...draft, name })}
          placeholder="예: Claude Desktop"
          value={draft.name}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-medium">권한</Text>
        <McpPermissionTable
          availableScopes={info.scopes}
          disabled={disabled}
          onToggle={(scope) =>
            onChange({
              ...draft,
              scopes: draft.scopes.includes(scope)
                ? draft.scopes.filter((candidate) => candidate !== scope)
                : [...draft.scopes, scope],
            })
          }
          selectedScopes={draft.scopes}
          rows={MCP_DOMAIN_ROWS}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-medium">조직</Text>
        <View className="flex-row gap-2">
          <ChoiceChip
            disabled={disabled}
            label="내 모든 조직"
            onPress={() =>
              onChange({
                ...draft,
                organizationGrant: { mode: 'all-user-organizations' },
              })
            }
            selected={allOrganizations}
          />
          <ChoiceChip
            disabled={disabled}
            label="선택한 조직만"
            onPress={() => {
              if (allOrganizations)
                onChange({
                  ...draft,
                  // 조직은 최소 하나를 골라야 하므로 목록에서 직접 고르게 비워 둘 수 없다.
                  organizationGrant: { mode: 'selected', organizationIds: [] },
                });
            }}
            selected={!allOrganizations}
          />
        </View>
        {draft.organizationGrant.mode === 'selected' ? (
          <DashboardQueryBoundary
            fallback={
              <DashboardLoading
                className="min-h-16 flex-none"
                label="조직 목록을 불러오는 중..."
              />
            }
            title="조직 목록을 불러오지 못했습니다"
          >
            <OrganizationChecklist
              disabled={disabled}
              onChange={(organizationIds) =>
                onChange({
                  ...draft,
                  organizationGrant: { mode: 'selected', organizationIds },
                })
              }
              selectedIds={draft.organizationGrant.organizationIds}
            />
          </DashboardQueryBoundary>
        ) : null}
      </View>
    </View>
  );
}

function OrganizationChecklist({
  disabled,
  onChange,
  selectedIds,
}: {
  disabled: boolean;
  onChange: (organizationIds: string[]) => void;
  selectedIds: readonly string[];
}) {
  const organizations = useOrganizationsControllerListSuspense().data.items;
  return (
    <View className="overflow-hidden rounded-md border border-border">
      {organizations.map((organization, index) => {
        const selected = selectedIds.includes(organization.id);
        return (
          <Pressable
            accessibilityLabel={organization.name}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected, disabled }}
            className={cn(
              'min-h-9 flex-row items-center gap-2.5 px-2.5 py-1.5 web:hover:bg-accent/40',
              index > 0 && 'border-t border-border/60',
            )}
            disabled={disabled}
            key={organization.id}
            onPress={() =>
              onChange(
                selected
                  ? selectedIds.filter((id) => id !== organization.id)
                  : [...selectedIds, organization.id],
              )
            }
          >
            <View
              className={cn(
                'size-4 items-center justify-center rounded border border-input',
                selected && 'border-primary bg-primary',
              )}
            >
              {selected ? (
                <Icon as={Check} className="size-3 text-primary-foreground" />
              ) : null}
            </View>
            <Text className="min-w-0 flex-1 truncate text-xs">
              {organization.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// 저장 전에 화면에서 먼저 걸러 주는 입력 오류다. 없으면 null이다.
export function validateMcpAccessKeyDraft(
  draft: McpAccessKeyDraft,
): string | null {
  if (draft.name.trim().length === 0) return '이름을 입력해 주세요.';
  if (draft.scopes.length === 0) return '권한을 하나 이상 골라 주세요.';
  if (
    draft.organizationGrant.mode === 'selected' &&
    draft.organizationGrant.organizationIds.length === 0
  )
    return '조직을 하나 이상 골라 주세요.';
  return null;
}
