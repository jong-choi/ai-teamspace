import { createContext, type ReactNode, useContext } from 'react';

import type { OrganizationUserSummary } from '@repo/client/api-client/schemas';

import type { createAuthClient } from 'better-auth/react';

type AuthClient = ReturnType<typeof createAuthClient>;

// 서버 username plugin이 받는 field를 더한 가입·수정 계약이다.
type DashboardAuthentication = {
  signIn: AuthClient['signIn'];
  signUp: {
    email: (
      input: Parameters<AuthClient['signUp']['email']>[0] & {
        username: string;
      },
    ) => ReturnType<AuthClient['signUp']['email']>;
  };
  updateUser: (input: {
    name?: string;
    username?: string;
  }) => Promise<{ error: { message?: string } | null }>;
};

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
  authentication: DashboardAuthentication;
  currentUserId: string | null;
  currentUser: OrganizationUserSummary | null;
  currentUsername: string | null;
  sessionError: boolean;
  sessionPending: boolean;
  copyText: (value: string) => Promise<void>;
  createAppUrl: (path: string) => string;
  exportCalendarIcs: (file: DashboardCalendarExport) => Promise<void>;
  exportMarkdown: (file: DashboardMarkdownExport) => Promise<void>;
  notifyError: (notification: DashboardNotification) => void;
  notifySuccess: (notification: DashboardNotification) => void;
  // 기기에서 이미지 파일 하나를 고른다. 취소하면 null이다.
  pickImageFile: () => Promise<Blob | null>;
  // 이름·사용자명·사진을 바꾼 뒤 session의 사용자 정보를 다시 읽는다.
  refreshSession: () => Promise<void>;
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
