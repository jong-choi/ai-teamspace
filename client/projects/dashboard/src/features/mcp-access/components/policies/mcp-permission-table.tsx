import { Pressable, View } from 'react-native';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  MCP_ACTION_COLUMNS,
  type McpAccessScope,
  type McpDomainRow,
} from '@core/features/mcp-access/mcp-access-presentation';

import { Check, LockKeyhole } from 'lucide-react-native';

// 영역(행) × 조회·변경(열) 권한 표다. lockedScopes는 조직 정책이 막아 고를 수 없는 칸이다.
export function McpPermissionTable({
  availableScopes,
  disabled = false,
  lockedScopes = [],
  onToggle,
  rows,
  selectedScopes,
}: {
  availableScopes: readonly McpAccessScope[];
  disabled?: boolean;
  lockedScopes?: readonly McpAccessScope[];
  onToggle: (scope: McpAccessScope) => void;
  rows: readonly McpDomainRow[];
  selectedScopes: readonly McpAccessScope[];
}) {
  const hasLockedCell = lockedScopes.length > 0;

  return (
    <View className="gap-2">
      <View className="overflow-hidden rounded-lg border border-border">
        <View className="flex-row items-center border-b border-border bg-muted/40 px-3 py-2">
          <Text className="w-20 text-xs font-semibold text-muted-foreground">
            영역
          </Text>
          <Text className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
            범위
          </Text>
          {MCP_ACTION_COLUMNS.map((column) => (
            <Text
              className="w-14 text-center text-xs font-semibold text-muted-foreground"
              key={column.action}
            >
              {column.label}
            </Text>
          ))}
        </View>

        {rows.map((row, index) => (
          <View
            className={cn(
              'flex-row items-center px-3 py-1.5',
              index > 0 && 'border-t border-border/70',
            )}
            key={row.domain}
          >
            <Text className="w-20 text-xs font-medium">{row.label}</Text>
            <Text className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {row.description}
            </Text>
            {MCP_ACTION_COLUMNS.map((column) => {
              const scope = availableScopes.find(
                (candidate) => candidate === `${row.domain}:${column.action}`,
              );
              return (
                <View className="w-14 items-center" key={column.action}>
                  {scope ? (
                    <PermissionCell
                      checked={selectedScopes.includes(scope)}
                      disabled={disabled}
                      label={`${row.label} ${column.label}`}
                      locked={lockedScopes.includes(scope)}
                      onPress={() => onToggle(scope)}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {hasLockedCell ? (
        <View className="flex-row items-center gap-1.5">
          <Icon as={LockKeyhole} className="size-3 text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">
            조직 정책에서 막은 권한
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function PermissionCell({
  checked,
  disabled,
  label,
  locked,
  onPress,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  locked: boolean;
  onPress: () => void;
}) {
  const cellDisabled = disabled || locked;
  return (
    <Pressable
      accessibilityLabel={locked ? `${label}, 조직 정책에서 막음` : label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: cellDisabled }}
      className="size-8 items-center justify-center"
      disabled={cellDisabled}
      onPress={onPress}
    >
      <View
        className={cn(
          'size-4 items-center justify-center rounded border border-input',
          checked && !locked && 'border-primary bg-primary',
          locked && 'border-transparent',
          disabled && !locked && 'opacity-50',
        )}
      >
        {locked ? (
          <Icon as={LockKeyhole} className="size-3 text-muted-foreground" />
        ) : checked ? (
          <Icon as={Check} className="size-3 text-primary-foreground" />
        ) : null}
      </View>
    </Pressable>
  );
}
