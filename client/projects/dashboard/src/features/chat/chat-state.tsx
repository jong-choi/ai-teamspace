import { type ReactNode, Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Text } from '@repo/client/rnr/components/ui/text';
import { DashboardErrorBoundary } from '@core/app/error/dashboard-error-boundary';

export function ChatLoading({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3 px-6">
      <ActivityIndicator />
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

export function ChatState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-sm font-semibold">{title}</Text>
      <Text className="mt-1 max-w-md text-center text-xs leading-5 text-muted-foreground">
        {description}
      </Text>
    </View>
  );
}

type ChatQueryBoundaryProps = {
  children: ReactNode;
  errorFallbackClassName?: string;
  fallback: ReactNode;
  resetKeys?: unknown[];
  title?: string;
};

export function ChatQueryBoundary({
  children,
  errorFallbackClassName,
  fallback,
  resetKeys,
  title = '채팅을 불러오지 못했습니다',
}: ChatQueryBoundaryProps) {
  return (
    <DashboardErrorBoundary
      fallbackClassName={errorFallbackClassName}
      homeHref="/chat"
      resetKeys={resetKeys}
      title={title}
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </DashboardErrorBoundary>
  );
}
