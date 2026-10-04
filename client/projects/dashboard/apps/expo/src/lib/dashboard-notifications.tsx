import { type ReactNode, useCallback } from 'react';

import { ToastProvider, useToast } from '@repo/client/rnr/components/ui/toast';
import type { DashboardPlatformValue } from '@core/app/platform/dashboard-platform';

export function DashboardNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}

export function useDashboardNotifications(): Pick<
  DashboardPlatformValue,
  'notifyError' | 'notifySuccess'
> {
  const { show } = useToast();
  const notifyError = useCallback<DashboardPlatformValue['notifyError']>(
    ({ id, title, description }) => {
      show({ id, title, description, variant: 'destructive' });
    },
    [show],
  );
  const notifySuccess = useCallback<DashboardPlatformValue['notifySuccess']>(
    ({ id, title, description }) => {
      show({ id, title, description });
    },
    [show],
  );

  return { notifyError, notifySuccess };
}
