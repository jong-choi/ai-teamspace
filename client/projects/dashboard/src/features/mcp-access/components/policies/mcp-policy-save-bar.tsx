import { View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import type { McpAccessScope } from '@core/features/mcp-access/mcp-access-presentation';

export function countChangedScopes(
  saved: readonly McpAccessScope[],
  selected: readonly McpAccessScope[],
): number {
  const added = selected.filter((scope) => !saved.includes(scope)).length;
  const removed = saved.filter((scope) => !selected.includes(scope)).length;
  return added + removed;
}

// 표 아래에 항상 있는 저장 줄이다. 바꾼 것이 없을 때 누르면 저장하지 않고 그 사실만 알린다.
export function McpPolicySaveBar({
  changedCount,
  onSave,
  pending,
}: {
  changedCount: number;
  onSave: () => void;
  pending: boolean;
}) {
  const { notifySuccess } = useDashboardPlatform();
  return (
    <View className="flex-row items-center justify-end">
      <Button
        disabled={pending}
        onPress={() => {
          if (changedCount === 0) {
            notifySuccess({ title: '변경 사항이 없습니다' });
            return;
          }
          onSave();
        }}
        size="sm"
      >
        <Text className="text-xs text-primary-foreground">
          {pending ? '저장 중...' : '저장'}
        </Text>
      </Button>
    </View>
  );
}
