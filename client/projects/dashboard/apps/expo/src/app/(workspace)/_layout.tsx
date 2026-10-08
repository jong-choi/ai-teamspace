import { Slot } from 'expo-router';

import { DashboardShell } from '@core/app/shell/dashboard-shell';

export default function WorkspaceLayout() {
  return (
    <DashboardShell>
      <Slot />
    </DashboardShell>
  );
}
