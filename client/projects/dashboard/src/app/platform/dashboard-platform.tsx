import { createContext, type ReactNode, useContext } from 'react';

import type { createAuthClient } from 'better-auth/react';

export type DashboardNotification = {
  id?: string;
  title: string;
  description?: string;
};

export type DashboardMarkdownExport = {
  fileName: string;
  contentMarkdown: string;
};

export type DashboardCalendarExport = {
  fileName: string;
  contentIcs: string;
};

export type DashboardPlatformValue = {
  authentication: Pick<
    ReturnType<typeof createAuthClient>,
    'signIn' | 'signUp'
  >;
  currentUserId: string | null;
  sessionPending: boolean;
  copyText: (value: string) => Promise<void>;
  createAppUrl: (path: string) => string;
  exportCalendarIcs: (file: DashboardCalendarExport) => Promise<void>;
  exportMarkdown: (file: DashboardMarkdownExport) => Promise<void>;
  notifyError: (notification: DashboardNotification) => void;
  notifySuccess: (notification: DashboardNotification) => void;
};

const DashboardPlatformContext = createContext<DashboardPlatformValue | null>(
  null,
);

type DashboardPlatformProviderProps = {
  children: ReactNode;
  value: DashboardPlatformValue;
};

export function DashboardPlatformProvider({
  children,
  value,
}: DashboardPlatformProviderProps) {
  return (
    <DashboardPlatformContext.Provider value={value}>
      {children}
    </DashboardPlatformContext.Provider>
  );
}

export function useDashboardPlatform(): DashboardPlatformValue {
  const value = useContext(DashboardPlatformContext);
  if (!value) {
    throw new Error('Dashboard 플랫폼 어댑터가 연결되지 않았습니다.');
  }
  return value;
}
