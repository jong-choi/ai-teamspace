import { useOrganizationsControllerGetActiveSuspense } from '@repo/client/api-client';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';

export function DashboardOrganizationLabel() {
  const { currentUserId } = useDashboardPlatform();
  if (!currentUserId)
    return <Text className="text-sm font-semibold">조직 선택</Text>;
  return (
    <DashboardQueryBoundary
      fallback={<Text className="text-sm">조직 확인 중...</Text>}
      resetKeys={[currentUserId]}
    >
      <ResolvedOrganizationLabel />
    </DashboardQueryBoundary>
  );
}
function ResolvedOrganizationLabel() {
  const { data } = useOrganizationsControllerGetActiveSuspense();
  return (
    <Text className="max-w-[150px] truncate text-sm font-semibold">
      {data.activeOrganization?.organization.name ?? '조직 선택'}
    </Text>
  );
}
