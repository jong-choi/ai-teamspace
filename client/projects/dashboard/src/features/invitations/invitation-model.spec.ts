import type {
  OrganizationInvitation,
  OrganizationInvitationDetail,
} from '@repo/client/api-client/schemas';
import {
  getInvitationStatusLabel,
  isInvitationExpired,
  mergeInvitationResultIntoDetail,
} from '@core/features/invitations/invitation-model';

import { describe, expect, it } from '@jest/globals';

const detail: OrganizationInvitationDetail = {
  id: 'invitation-a',
  organization: {
    id: 'organization-a',
    name: '조직 A',
    slug: 'organization-a',
  },
  inviter: {
    id: 'inviter-a',
    email: 'inviter@example.com',
    name: '초대자',
    username: 'inviter',
    image: null,
  },
  role: 'member',
  status: 'pending',
  createdAt: '2026-10-05T00:00:00.000Z',
  expiresAt: '2026-10-07T00:00:00.000Z',
};

describe('조직 초대 상세 UI 모델', () => {
  it('mutation 결과를 기존 상세 정보에 병합해 organization과 inviter를 보존한다', () => {
    const result: OrganizationInvitation = {
      id: detail.id,
      role: 'member',
      status: 'rejected',
      createdAt: detail.createdAt,
      expiresAt: detail.expiresAt,
    };

    expect(mergeInvitationResultIntoDetail(detail, result)).toEqual({
      ...detail,
      status: 'rejected',
    });
  });

  it('만료 여부와 상태 label을 UI에서 일관되게 계산한다', () => {
    expect(
      isInvitationExpired(
        detail,
        new Date('2026-10-06T00:00:00.000Z').getTime(),
      ),
    ).toBe(false);
    expect(
      isInvitationExpired(
        detail,
        new Date('2026-10-08T00:00:00.000Z').getTime(),
      ),
    ).toBe(true);
    expect(getInvitationStatusLabel('pending')).toBe('응답 대기중');
    expect(getInvitationStatusLabel('accepted')).toBe('수락됨');
    expect(getInvitationStatusLabel('rejected')).toBe('거절됨');
    expect(getInvitationStatusLabel('canceled')).toBe('취소됨');
  });
});
