import { type ReactNode, useCallback } from 'react';

import type { DashboardPlatformValue } from '@core/app/platform/dashboard-platform';

import { toast, Toaster } from 'sonner';

export function DashboardNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster closeButton position="top-center" richColors />
    </>
  );
}

export function useDashboardNotifications(): Pick<
  DashboardPlatformValue,
  'notifyError' | 'notifySuccess'
> {
  const notifyError = useCallback<DashboardPlatformValue['notifyError']>(
    ({ id, title, description }) => {
      toast.error(title, { description, id });
    },
    [],
  );
  const notifySuccess = useCallback<DashboardPlatformValue['notifySuccess']>(
    ({ id, title, description }) => {
      toast.success(title, { description, id });
    },
    [],
  );

  return { notifyError, notifySuccess };
}
