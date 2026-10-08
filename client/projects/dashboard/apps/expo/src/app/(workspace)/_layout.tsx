import { Slot } from 'expo-router';

import { DashboardWorkspaceLayout } from '@core/app/shell/dashboard-workspace-layout';

export default function WorkspaceLayout() {
  return (
    <DashboardWorkspaceLayout>
      <Slot />
    </DashboardWorkspaceLayout>
  );
}
