import { useState } from 'react';
import { View } from 'react-native';

import type {
  OrganizationAccess,
  OrganizationMember,
} from '@repo/client/api-client/schemas';
import { Text } from '@repo/client/rnr/components/ui/text';
import { CancelOrganizationInvitationDialog } from '@core/features/organizations/cancel-organization-invitation-dialog';
import type { PendingOrganizationInvitation } from '@core/features/organizations/organization-invitation-model';
import { useOrganizationInvitationMutations } from '@core/features/organizations/organization-invitation-mutations';
import { useOrganizationPendingInvitations } from '@core/features/organizations/organization-invitation-query';
import { OrganizationInvitationRow } from '@core/features/organizations/organization-invitation-row';
import { createOrganizationManagementRows } from '@core/features/organizations/organization-management-row';
import type { OrganizationMemberRole } from '@core/features/organizations/organization-member-model';
import { OrganizationMemberRow } from '@core/features/organizations/organization-member-row';

export function OrganizationInvitationManagementRows({
  actorRole,
  actorUserId,
  memberMutationPending,
  members,
  onChangeRole,
  onRequestRemove,
  organizationId,
  organizationName,
}: {
  actorRole: OrganizationAccess['role'];
  actorUserId: string;
  memberMutationPending: boolean;
  members: readonly OrganizationMember[];
  onChangeRole: (
    member: OrganizationMember,
    role: OrganizationMemberRole,
  ) => void;
  onRequestRemove: (member: OrganizationMember) => void;
  organizationId: string;
  organizationName: string;
}) {
  const invitations = useOrganizationPendingInvitations(organizationId).data;
  const invitationMutations =
    useOrganizationInvitationMutations(organizationId);
  const [invitationToCancel, setInvitationToCancel] =
    useState<PendingOrganizationInvitation | null>(null);
  const rows = createOrganizationManagementRows(members, invitations.items);

  if (rows.length === 0) {
    return <EmptyManagementRows />;
  }

  return (
    <>
      {rows.map((row) =>
        row.kind === 'invitation' ? (
          <OrganizationInvitationRow
            cancelPending={
              invitationMutations.cancelingInvitationId === row.invitation.id
            }
            invitation={row.invitation}
            key={`invitation:${row.invitation.id}`}
            onRequestCancel={setInvitationToCancel}
            onResend={invitationMutations.resend}
            resendPending={
              invitationMutations.resendingInvitationId === row.invitation.id
            }
          />
        ) : (
          <OrganizationMemberRow
            actorRole={actorRole}
            actorUserId={actorUserId}
            key={`member:${row.member.id}`}
            member={row.member}
            mutationPending={memberMutationPending}
            onChangeRole={onChangeRole}
            onRequestRemove={onRequestRemove}
          />
        ),
      )}

      <CancelOrganizationInvitationDialog
        invitation={invitationToCancel}
        onConfirm={(invitation) => {
          invitationMutations.cancel(invitation.id, () =>
            setInvitationToCancel(null),
          );
        }}
        onOpenChange={(open) => {
          if (!open) setInvitationToCancel(null);
        }}
        open={invitationToCancel !== null}
        organizationName={organizationName}
        pending={
          invitationToCancel !== null &&
          invitationMutations.cancelingInvitationId === invitationToCancel.id
        }
      />
    </>
  );
}

export function OrganizationPendingInvitationFooterCount({
  organizationId,
}: {
  organizationId: string;
}) {
  const invitations = useOrganizationPendingInvitations(organizationId).data;

  return (
    <Text className="text-xs text-muted-foreground">
      · 초대 대기 {invitations.total}건
    </Text>
  );
}

function EmptyManagementRows() {
  return (
    <View className="min-h-40 items-center justify-center px-6 py-10">
      <Text className="text-xs font-medium">
        표시할 멤버나 대기 중인 초대가 없습니다
      </Text>
      <Text className="mt-1 text-xs text-muted-foreground">
        등록 멤버 검색이나 역할 필터를 변경해 보세요.
      </Text>
    </View>
  );
}
