import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { InvitationDetail } from '@core/features/invitations/invitation-detail';
import { useInvitationMutations } from '@core/features/invitations/invitation-mutations';
import { useInvitationDetail } from '@core/features/invitations/invitation-query';

export function InvitationRoute({ invitationId }: { invitationId?: string }) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  if (sessionPending) {
    return (
      <DashboardShell>
        <DashboardLoading label="세션을 확인하는 중..." />
      </DashboardShell>
    );
  }

  if (!currentUserId) {
    return (
      <DashboardShell>
        <DashboardState
          description="조직 초대를 확인하려면 먼저 로그인해 주세요."
          title="로그인이 필요합니다"
        />
      </DashboardShell>
    );
  }

  if (!invitationId) {
    return (
      <DashboardShell>
        <DashboardState
          description="초대 링크를 다시 확인해 주세요."
          title="초대를 찾을 수 없습니다"
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DashboardQueryBoundary
        description="초대가 만료되었거나 취소되었거나, 현재 계정이 이 초대의 수신자가 아닐 수 있습니다."
        fallback={<DashboardLoading label="조직 초대를 불러오는 중..." />}
        resetKeys={[invitationId]}
        title="초대를 확인할 수 없습니다"
      >
        <AuthenticatedInvitationRoute invitationId={invitationId} />
      </DashboardQueryBoundary>
    </DashboardShell>
  );
}

function AuthenticatedInvitationRoute({
  invitationId,
}: {
  invitationId: string;
}) {
  const router = useRouter();
  const invitation = useInvitationDetail(invitationId).data;
  const mutations = useInvitationMutations(invitation);

  return (
    <View className="min-h-0 flex-1 items-center justify-center px-4 py-8 sm:px-8">
      <InvitationDetail
        accepting={mutations.accepting}
        invitation={invitation}
        onAccept={() =>
          mutations.accept(() =>
            router.replace({
              pathname: '/organizations/[organizationId]/members',
              params: { organizationId: invitation.organization.id },
            }),
          )
        }
        onBack={() => router.back()}
        onReject={mutations.reject}
        rejecting={mutations.rejecting}
      />
    </View>
  );
}
