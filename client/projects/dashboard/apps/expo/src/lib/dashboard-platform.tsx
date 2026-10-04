import { type ReactNode, useMemo } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';

import { DashboardPlatformProvider } from '@core/app/platform/dashboard-platform';
import { authClient } from '@/lib/auth-client';
import {
  DashboardNotificationsProvider,
  useDashboardNotifications,
} from '@/lib/dashboard-notifications';

type ExpoDashboardPlatformProviderProps = {
  children: ReactNode;
};

export function ExpoDashboardPlatformProvider({
  children,
}: ExpoDashboardPlatformProviderProps) {
  return (
    <DashboardNotificationsProvider>
      <ExpoDashboardPlatformBridge>{children}</ExpoDashboardPlatformBridge>
    </DashboardNotificationsProvider>
  );
}

function ExpoDashboardPlatformBridge({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const currentUserId = session.data?.user.id ?? null;
  const { notifyError, notifySuccess } = useDashboardNotifications();

  const value = useMemo(
    () => ({
      currentUserId,
      sessionPending: session.isPending,
      copyText: async (text: string) => {
        await Clipboard.setStringAsync(text);
      },
      createAppUrl: (path: string) =>
        Linking.createURL(path.replace(/^\//, '')),
      notifyError,
      notifySuccess,
    }),
    [currentUserId, notifyError, notifySuccess, session.isPending],
  );

  return (
    <DashboardPlatformProvider value={value}>
      {children}
    </DashboardPlatformProvider>
  );
}
