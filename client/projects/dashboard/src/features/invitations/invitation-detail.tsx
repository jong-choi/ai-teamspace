import { ActivityIndicator, View } from 'react-native';

import type { OrganizationInvitationDetail } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  getInvitationStatusLabel,
  isInvitationExpired,
} from '@core/features/invitations/invitation-model';
import { getOrganizationMemberRoleLabel } from '@core/features/organizations/organization-member-model';

import { Building2, Check, X } from 'lucide-react-native';

export function InvitationDetail({
  accepting,
  invitation,
  onAccept,
  onBack,
  onReject,
  rejecting,
}: {
  accepting: boolean;
  invitation: OrganizationInvitationDetail;
  onAccept: () => void;
  onBack: () => void;
  onReject: () => void;
  rejecting: boolean;
}) {
  const expired =
    invitation.status === 'pending' && isInvitationExpired(invitation);
  const pending = invitation.status === 'pending' && !expired;
  const inviterName =
    invitation.inviter.name?.trim() ||
    invitation.inviter.username?.trim() ||
    invitation.inviter.email;

  return (
    <View className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <View className="gap-3 border-b border-border px-6 py-5">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-lg bg-muted">
            <Icon as={Building2} className="size-4 text-muted-foreground" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-base font-bold">조직 초대</Text>
          </View>
          <View className="rounded-full border border-border bg-muted px-2.5 py-1">
            <Text className="text-2xs font-semibold text-muted-foreground">
              {expired ? '만료됨' : getInvitationStatusLabel(invitation.status)}
            </Text>
          </View>
        </View>
      </View>

      <View className="gap-5 px-6 py-6">
        <View className="gap-2">
          <Text className="text-sm leading-6">
            <Text className="font-semibold">{inviterName}</Text>님이{' '}
            <Text className="font-semibold">
              {invitation.organization.name}
            </Text>{' '}
            조직에{' '}
            <Text className="font-semibold">
              {getOrganizationMemberRoleLabel(invitation.role)}
            </Text>{' '}
            역할로 초대했습니다.
          </Text>
          <Text className="text-xs text-muted-foreground">
            만료: {formatDateTime(invitation.expiresAt)}
          </Text>
        </View>

        {pending ? (
          <View className="gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              disabled={accepting || rejecting}
              onPress={onReject}
              variant="outline"
            >
              {rejecting ? (
                <ActivityIndicator size="small" />
              ) : (
                <Icon as={X} className="size-4 text-muted-foreground" />
              )}
              <Text>{rejecting ? '거절 중' : '거절'}</Text>
            </Button>
            <Button disabled={accepting || rejecting} onPress={onAccept}>
              {accepting ? (
                <ActivityIndicator size="small" />
              ) : (
                <Icon as={Check} className="size-4 text-primary-foreground" />
              )}
              <Text className="text-primary-foreground">
                {accepting ? '수락 중' : '수락'}
              </Text>
            </Button>
          </View>
        ) : (
          <InvitationResolvedState
            expired={expired}
            invitation={invitation}
            onBack={onBack}
          />
        )}
      </View>
    </View>
  );
}

function InvitationResolvedState({
  expired,
  invitation,
  onBack,
}: {
  expired: boolean;
  invitation: OrganizationInvitationDetail;
  onBack: () => void;
}) {
  const title = expired
    ? '이 초대는 만료되었습니다.'
    : invitation.status === 'accepted'
      ? '이 초대를 수락했습니다.'
      : invitation.status === 'rejected'
        ? '이 초대를 거절했습니다.'
        : '이 초대는 더 이상 사용할 수 없습니다.';

  return (
    <View className="gap-3 border-t border-border pt-5">
      <Text className="text-xs font-medium">{title}</Text>
      <Button className="self-start" onPress={onBack} variant="outline">
        <Text>이전 화면으로</Text>
      </Button>
    </View>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
