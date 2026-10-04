import { type ReactNode, useCallback } from 'react';

import type { DashboardPlatformValue } from '@core/app/platform/dashboard-platform';
import { ToastProvider, useToast } from '@repo/client/rnr/components/ui/toast';

export function DashboardNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}

export function useDashboardNotifications(): Pick<
  DashboardPlatformValue,
  'notifyError'
> {
  const { show } = useToast();
  const notifyError = useCallback<DashboardPlatformValue['notifyError']>(
    ({ id, title, description }) => {
      show({ id, title, description, variant: 'destructive' });
    },
    [show],
  );

  return { notifyError };
}
