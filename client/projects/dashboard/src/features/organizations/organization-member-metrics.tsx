import { View } from 'react-native';

import type { OrganizationAccess } from '@repo/client/api-client/schemas';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useOrganizationPendingInvitationTotal } from '@core/features/organizations/organization-invitation-query';
import { canManageOrganizationInvitations } from '@core/features/organizations/organization-member-permissions';
import { useOrganizationMemberTotal } from '@core/features/organizations/organization-members-query';

export function OrganizationMemberMetrics({
  actorRole,
  organizationId,
}: {
  actorRole: OrganizationAccess['role'];
  organizationId: string;
}) {
  const total = useOrganizationMemberTotal(organizationId).data;
  const canManageInvitations = canManageOrganizationInvitations(actorRole);

  return (
    <View className="flex-row flex-wrap gap-4">
      <MetricCard
        description="조직 전체 구성원 수"
        label="총 등록 멤버"
        value={`${total}명`}
      />
      <MetricCard
        description="상태 정보 없음"
        label="정상 활성 멤버"
        muted
        value="—"
      />
      {canManageInvitations ? (
        <PendingInvitationMetric organizationId={organizationId} />
      ) : (
        <MetricCard
          description="관리 권한이 있는 사용자만 조회할 수 있습니다"
          label="초대 대기중"
          muted
          value="—"
        />
      )}
      <MetricCard
        description="라이선스 정보 없음"
        label="AI 시트 할당율"
        muted
        value="—"
      />
    </View>
  );
}

function PendingInvitationMetric({
  organizationId,
}: {
  organizationId: string;
}) {
  const total = useOrganizationPendingInvitationTotal(organizationId).data;

  return (
    <MetricCard
      description="수락 대기 중인 조직 초대"
      label="초대 대기중"
      value={`${total}건`}
    />
  );
}

function MetricCard({
  description,
  label,
  muted = false,
  value,
}: {
  description: string;
  label: string;
  muted?: boolean;
  value: string;
}) {
  return (
    <View className="w-full rounded-xl border border-border bg-card p-4 sm:w-[48%] lg:w-auto lg:min-w-0 lg:flex-1">
      <Text className="mb-1 text-xs text-muted-foreground">{label}</Text>
      <Text
        className={
          muted
            ? 'text-2xl font-bold tracking-tight text-muted-foreground'
            : 'text-2xl font-bold tracking-tight text-foreground'
        }
      >
        {value}
      </Text>
      <Text className="mt-1 text-[11px] text-muted-foreground">
        {description}
      </Text>
    </View>
  );
}
