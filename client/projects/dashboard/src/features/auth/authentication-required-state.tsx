import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';

import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';

export function AuthenticationRequiredState({
  className,
}: {
  className?: string;
}) {
  return (
    <View className={cn('flex-1 items-center justify-center px-6', className)}>
      <Text className="text-sm font-semibold">로그인이 필요합니다</Text>
      <View className="mt-1 flex-row flex-wrap items-center justify-center">
        <Link asChild href="/login">
          <Pressable accessibilityRole="link">
            <Text className="text-xs font-medium leading-5 text-primary underline web:cursor-pointer">
              로그인
            </Text>
          </Pressable>
        </Link>
        <Text className="text-xs leading-5 text-muted-foreground"> 또는 </Text>
        <Link asChild href="/signup">
          <Pressable accessibilityRole="link">
            <Text className="text-xs font-medium leading-5 text-primary underline web:cursor-pointer">
              회원가입
            </Text>
          </Pressable>
        </Link>
        <Text className="text-xs leading-5 text-muted-foreground">
          을 한 뒤 다시 접속해주세요.
        </Text>
      </View>
    </View>
  );
}
