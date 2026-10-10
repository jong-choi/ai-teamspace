import { View } from 'react-native';

import type { McpConnectionInfo } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';

import { Copy } from 'lucide-react-native';

// 발급 직후 한 번만 볼 수 있는 접근 키와, 그 키가 실린 연결 주소다.
export function McpAccessKeySecretView({
  info,
  secret,
}: {
  info: McpConnectionInfo;
  secret: string;
}) {
  const connectionUrl = `${info.resourceUrl}?${info.accessKey.urlParameter}=${encodeURIComponent(secret)}`;

  return (
    <View className="gap-4">
      <Text className="text-xs leading-5 text-muted-foreground">
        아래 값은 지금만 볼 수 있습니다. 잃어버리면 이 키를 삭제하고 새로
        만들어야 합니다.
      </Text>
      <SecretField
        copiedTitle="연결 주소를 복사했습니다."
        description="외부 도구의 MCP 주소 칸에 넣고, 인증은 '인증 없음'으로 두세요."
        label="연결 주소"
        value={connectionUrl}
      />
      <SecretField
        copiedTitle="접근 키를 복사했습니다."
        description="인증 칸이 따로 있는 도구는 주소에 MCP 주소를, 인증(Bearer token)에 이 키를 넣어도 됩니다."
        label="접근 키"
        value={secret}
      />
    </View>
  );
}

function SecretField({
  copiedTitle,
  description,
  label,
  value,
}: {
  copiedTitle: string;
  description: string;
  label: string;
  value: string;
}) {
  const { copyText, notifyError, notifySuccess } = useDashboardPlatform();

  const copy = async () => {
    try {
      await copyText(value);
      notifySuccess({ title: copiedTitle });
    } catch {
      notifyError({ title: `${label}를 복사하지 못했습니다` });
    }
  };

  return (
    <View className="gap-1.5">
      <Text className="text-xs font-medium">{label}</Text>
      <View className="flex-row items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <Text className="min-w-0 flex-1 font-mono text-xs" selectable>
          {value}
        </Text>
        <Button
          accessibilityLabel={`${label} 복사`}
          className="h-7 gap-1.5 px-2"
          onPress={() => void copy()}
          size="sm"
          variant="outline"
        >
          <Icon as={Copy} className="size-3" />
          <Text className="text-xs">복사</Text>
        </Button>
      </View>
      <Text className="text-xs leading-4 text-muted-foreground">
        {description}
      </Text>
    </View>
  );
}
