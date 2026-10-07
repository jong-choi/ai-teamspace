import { View } from 'react-native';

import type { McpAccessComposite } from '@repo/client/api-client/schemas';
import { Text } from '@repo/client/rnr/components/ui/text';

export function McpAccessSummary({ access }: { access: McpAccessComposite }) {
  const readCount = access.effectiveScopes.filter((scope) =>
    scope.endsWith(':read'),
  ).length;
  const writeCount = access.effectiveScopes.filter((scope) =>
    scope.endsWith(':write'),
  ).length;

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <View>
        <Text className="text-base font-semibold">현재 유효 권한</Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          실제 호출에서는 credential scope, 조직 grant, membership와 각 기능의
          도메인 권한까지 다시 검사합니다.
        </Text>
      </View>
      <View className="flex-row gap-3">
        <Metric label="조회 권한" value={readCount} />
        <Metric label="변경 권한" value={writeCount} />
        <Metric label="전체 capability" value={access.capabilities.length} />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View className="min-w-0 flex-1 rounded-lg bg-muted/50 p-3">
      <Text className="text-lg font-semibold">{value}</Text>
      <Text className="text-[11px] text-muted-foreground">{label}</Text>
    </View>
  );
}
