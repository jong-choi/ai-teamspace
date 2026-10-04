import '@/globals.css';

import { type ReactNode, useState } from 'react';
import { Stack } from 'expo-router';

import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { ChatRealtimeBoundary } from '@core/features/chat/chat-realtime-boundary';
import { ExpoDashboardPlatformProvider } from '@/lib/dashboard-platform';

import { PortalHost } from '@rn-primitives/portal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export default function RootLayout() {
  return (
    <ExpoDashboardPlatformProvider>
      <SessionQueryClientProvider>
        <ChatRealtimeBoundary>
          <Stack screenOptions={{ headerShown: false }} />
          <PortalHost />
        </ChatRealtimeBoundary>
      </SessionQueryClientProvider>
    </ExpoDashboardPlatformProvider>
  );
}

function SessionQueryClientProvider({ children }: { children: ReactNode }) {
  const { currentUserId } = useDashboardPlatform();

  return (
    <QueryClientBoundary
      key={
        currentUserId ? `session:user:${currentUserId}` : 'session:anonymous'
      }
    >
      {children}
    </QueryClientBoundary>
  );
}

function QueryClientBoundary({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
