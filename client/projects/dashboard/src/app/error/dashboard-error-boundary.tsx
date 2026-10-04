import type { ReactNode } from 'react';
import {
  ErrorBoundary,
  type FallbackProps,
  type OnErrorCallback,
} from 'react-error-boundary';
import { View } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { getProblemDetails } from '@monorepo-erp/api-client/runtime';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';

import { QueryErrorResetBoundary } from '@tanstack/react-query';

type DashboardErrorBoundaryProps = {
  children: ReactNode;
  description?: string;
  fallbackClassName?: string;
  homeHref?: Href;
  resetKeys?: unknown[];
  title?: string;
};

export function DashboardErrorBoundary({
  children,
  description = '연결 상태를 확인한 뒤 다시 시도해 주세요.',
  fallbackClassName,
  homeHref = '/',
  resetKeys,
  title = '화면을 불러오지 못했습니다',
}: DashboardErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          fallbackRender={(props) => (
            <DashboardErrorFallback
              {...props}
              description={description}
              fallbackClassName={fallbackClassName}
              homeHref={homeHref}
              title={title}
            />
          )}
          onError={handleBoundaryError}
          onReset={reset}
          resetKeys={resetKeys}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

type DashboardErrorFallbackProps = FallbackProps & {
  description: string;
  fallbackClassName?: string;
  homeHref: Href;
  title: string;
};

function DashboardErrorFallback({
  error,
  resetErrorBoundary,
  description,
  fallbackClassName,
  homeHref,
  title,
}: DashboardErrorFallbackProps) {
  const router = useRouter();

  if (isRedirectControlFlow(error)) {
    throw error;
  }

  const problem = getProblemDetails(error);

  return (
    <View
      accessibilityRole="alert"
      className={cn(
        'items-center justify-center px-6',
        fallbackClassName ?? 'flex-1',
      )}
    >
      <Text className="text-sm font-semibold">{title}</Text>
      <Text className="mt-1 max-w-md text-center text-xs leading-5 text-muted-foreground">
        {problem?.detail ?? problem?.title ?? description}
      </Text>
      <View className="mt-4 flex-row gap-2">
        <Button onPress={resetErrorBoundary}>
          <Text className="text-primary-foreground">다시 시도</Text>
        </Button>
        <Button
          onPress={() => {
            router.replace(homeHref);
            resetErrorBoundary();
          }}
          variant="outline"
        >
          <Text>홈으로</Text>
        </Button>
      </View>
    </View>
  );
}

const handleBoundaryError: OnErrorCallback = (error, info) => {
  if (isRedirectControlFlow(error)) {
    return;
  }
  if (__DEV__) {
    console.warn('화면 렌더링 오류가 발생했습니다.', error, info);
  }
};

function isRedirectControlFlow(error: unknown): error is Response {
  // Expo Router의 Redirect는 예외를 던지지 않지만 3xx Response는 라우팅 제어 흐름으로 보존한다.
  return error instanceof Response && error.status >= 300 && error.status < 400;
}
