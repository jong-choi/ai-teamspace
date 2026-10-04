import type {
  OrganizationInvitation,
  OrganizationInvitationDetail,
} from '@repo/client/api-client/schemas';

export function mergeInvitationResultIntoDetail(
  detail: OrganizationInvitationDetail,
  result: OrganizationInvitation,
): OrganizationInvitationDetail {
  return {
    ...detail,
    id: result.id,
    role: result.role,
    status: result.status,
    expiresAt: result.expiresAt,
    createdAt: result.createdAt,
  };
}

export function isInvitationExpired(
  invitation: Pick<OrganizationInvitationDetail, 'expiresAt'>,
  now = Date.now(),
): boolean {
  return new Date(invitation.expiresAt).getTime() <= now;
}

export function getInvitationStatusLabel(
  status: OrganizationInvitationDetail['status'],
): string {
  switch (status) {
    case 'pending':
      return '응답 대기중';
    case 'accepted':
      return '수락됨';
    case 'rejected':
      return '거절됨';
    case 'canceled':
      return '취소됨';
  }
}
