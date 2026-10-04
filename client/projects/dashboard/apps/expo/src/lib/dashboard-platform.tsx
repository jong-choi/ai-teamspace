import { type ReactNode, useMemo } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';

import { DashboardPlatformProvider } from '@core/app/platform/dashboard-platform';
import { authClient } from '@/lib/auth-client';

type ExpoDashboardPlatformProviderProps = {
  children: ReactNode;
};

export function ExpoDashboardPlatformProvider({
  children,
}: ExpoDashboardPlatformProviderProps) {
  const session = authClient.useSession();
  const currentUserId = session.data?.user.id ?? null;

  const value = useMemo(
    () => ({
      currentUserId,
      sessionPending: session.isPending,
      copyText: async (text: string) => {
        await Clipboard.setStringAsync(text);
      },
      createAppUrl: (path: string) =>
        Linking.createURL(path.replace(/^\//, '')),
    }),
    [currentUserId, session.isPending],
  );

  return (
    <DashboardPlatformProvider value={value}>
      {children}
    </DashboardPlatformProvider>
  );
}
