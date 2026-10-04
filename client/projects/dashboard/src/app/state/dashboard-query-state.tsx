import { type ReactNode, Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Href } from 'expo-router';

import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { DashboardErrorBoundary } from '@core/app/error/dashboard-error-boundary';

export function DashboardLoading({
  className,
  label,
}: {
  className?: string;
  label: string;
}) {
  return (
    <View
      className={cn('flex-1 items-center justify-center gap-3 px-6', className)}
    >
      <ActivityIndicator />
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

export function DashboardState({
  className,
  title,
  description,
}: {
  className?: string;
  title: string;
  description: string;
}) {
  return (
    <View className={cn('flex-1 items-center justify-center px-6', className)}>
      <Text className="text-sm font-semibold">{title}</Text>
      <Text className="mt-1 max-w-md text-center text-xs leading-5 text-muted-foreground">
        {description}
      </Text>
    </View>
  );
}

type DashboardQueryBoundaryProps = {
  children: ReactNode;
  description?: string;
  errorFallbackClassName?: string;
  fallback: ReactNode;
  homeHref?: Href;
  resetKeys?: unknown[];
  title?: string;
};

export function DashboardQueryBoundary({
  children,
  description,
  errorFallbackClassName,
  fallback,
  homeHref,
  resetKeys,
  title,
}: DashboardQueryBoundaryProps) {
  return (
    <DashboardErrorBoundary
      description={description}
      fallbackClassName={errorFallbackClassName}
      homeHref={homeHref}
      resetKeys={resetKeys}
      title={title}
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </DashboardErrorBoundary>
  );
}
