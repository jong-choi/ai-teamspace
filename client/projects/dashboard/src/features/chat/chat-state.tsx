import type { ReactNode } from 'react';

import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';

export const ChatLoading = DashboardLoading;
export const ChatState = DashboardState;

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
    <DashboardQueryBoundary
      errorFallbackClassName={errorFallbackClassName}
      fallback={fallback}
      homeHref="/chat"
      resetKeys={resetKeys}
      title={title}
    >
      {children}
    </DashboardQueryBoundary>
  );
}
