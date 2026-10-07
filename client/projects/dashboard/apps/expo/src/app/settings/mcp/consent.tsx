import { useEffect } from 'react';
import { View } from 'react-native';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Text } from '@repo/client/rnr/components/ui/text';
import { parseAgentReturnTo } from '@core/features/agent-chat/lib/agent-return-to';

export default function McpConsentReturnPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const rawReturnTo = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;
  const returnTo = parseAgentReturnTo(rawReturnTo);

  useEffect(() => {
    const completion = WebBrowser.maybeCompleteAuthSession();
    if (completion.type !== 'success') {
      router.replace(returnTo as Href);
    }
  }, [returnTo, router]);

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="text-sm text-muted-foreground">
        Agent 위임 상태를 확인하는 중...
      </Text>
    </View>
  );
}
