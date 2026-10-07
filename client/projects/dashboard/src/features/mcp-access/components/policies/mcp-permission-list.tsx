import { Pressable, View } from 'react-native';

import type { McpAccessComposite } from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  MCP_SCOPE_PRESENTATION,
  type McpAccessScope,
} from '@core/features/mcp-access/mcp-access-presentation';

import { Check, LockKeyhole } from 'lucide-react-native';

export function McpPermissionList({
  capabilities,
  disabled = false,
  mode,
  onToggle,
  selectedScopes,
}: {
  capabilities: McpAccessComposite['capabilities'];
  disabled?: boolean;
  mode: 'organization' | 'personal';
  onToggle: (scope: McpAccessScope) => void;
  selectedScopes: readonly McpAccessScope[];
}) {
  return (
    <View className="gap-2">
      {capabilities.map((capability) => {
        const presentation = MCP_SCOPE_PRESENTATION[capability.scope];
        const selected = selectedScopes.includes(capability.scope);
        const organizationBlocked =
          mode === 'personal' && !capability.organizationAllowed;
        const itemDisabled = disabled || organizationBlocked;

        return (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected, disabled: itemDisabled }}
            className={cn(
              'flex-row items-start gap-3 rounded-lg border border-border bg-background p-3',
              selected && 'border-violet-500/30 bg-violet-500/5',
              itemDisabled && 'opacity-55',
            )}
            disabled={itemDisabled}
            key={capability.scope}
            onPress={() => onToggle(capability.scope)}
          >
            <View
              className={cn(
                'mt-0.5 size-5 items-center justify-center rounded border border-input',
                selected && 'border-violet-500 bg-violet-500/10',
              )}
            >
              {organizationBlocked ? (
                <Icon
                  as={LockKeyhole}
                  className="size-3 text-muted-foreground"
                />
              ) : selected ? (
                <Icon
                  as={Check}
                  className="size-3 text-violet-600 dark:text-violet-400"
                />
              ) : null}
            </View>
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-sm font-medium">
                  {presentation.label}
                </Text>
                <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {capability.action === 'read' ? 'READ' : 'WRITE'}
                </Text>
              </View>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {presentation.description}
              </Text>
              {organizationBlocked ? (
                <Text className="mt-1 text-[11px] text-muted-foreground">
                  조직 정책에서 허용되지 않아 개인 요청에 포함할 수 없습니다.
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
