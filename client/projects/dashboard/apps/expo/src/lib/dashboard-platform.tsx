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
      authentication: authClient,
      currentUserId,
      sessionPending: session.isPending,
      copyText: async (text: string) => {
        await Clipboard.setStringAsync(text);
      },
      createAppUrl: (path: string) =>
        Linking.createURL(path.replace(/^\//, '')),
      exportCalendarIcs: ({ fileName, contentIcs }) =>
        exportTextFile({
          fileName,
          content: contentIcs,
          mimeType: 'text/calendar;charset=utf-8',
        }),
      exportMarkdown: ({ fileName, contentMarkdown }) =>
        exportTextFile({
          fileName,
          content: contentMarkdown,
          mimeType: 'text/markdown;charset=utf-8',
        }),
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

async function exportTextFile({
  content,
  fileName,
  mimeType,
}: {
  content: string;
  fileName: string;
  mimeType: string;
}): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mimeType });
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
  file.write(content);
  try {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: fileName,
      mimeType,
    });
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      // 캐시 정리는 최선 노력이며 내보내기 성공 여부와 분리한다.
    }
  }
}
