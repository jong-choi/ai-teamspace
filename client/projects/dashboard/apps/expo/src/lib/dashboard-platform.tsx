import { type ReactNode, useMemo } from 'react';
import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';

import {
  DashboardPlatformProvider,
  type DashboardPlatformValue,
} from '@core/app/platform/dashboard-platform';
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

  const value = useMemo<DashboardPlatformValue>(
    () => ({
      currentUserId,
      sessionPending: session.isPending,
      copyText: async (text: string) => {
        await Clipboard.setStringAsync(text);
      },
      createAppUrl: (path: string) =>
        Linking.createURL(path.replace(/^\//, '')),
      exportMarkdown: async ({ fileName, contentMarkdown }) => {
        if (Platform.OS === 'web') {
          const blob = new Blob([contentMarkdown], {
            type: 'text/markdown;charset=utf-8',
          });
          const url = URL.createObjectURL(blob);
          try {
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = fileName;
            anchor.click();
          } finally {
            URL.revokeObjectURL(url);
          }
          return;
        }

        const file = new File(Paths.cache, fileName);
        file.write(contentMarkdown);
        try {
          await Sharing.shareAsync(file.uri, {
            dialogTitle: fileName,
            mimeType: 'text/markdown',
          });
        } finally {
          try {
            if (file.exists) file.delete();
          } catch {
            // Cache cleanup is best-effort; export success must not depend on it.
          }
        }
      },
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
