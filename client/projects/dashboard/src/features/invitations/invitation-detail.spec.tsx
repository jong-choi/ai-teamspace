import type { OrganizationInvitationDetail } from '@repo/client/api-client/schemas';
import { InvitationDetail } from '@core/features/invitations/invitation-detail';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

const pendingInvitation: OrganizationInvitationDetail = {
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
  expiresAt: '2099-10-07T00:00:00.000Z',
};

describe('조직 초대 상세 표시', () => {
  it('pending 초대의 수락과 거절 action을 presentation callback으로 전달한다', async () => {
    const onAccept = jest.fn();
    const onReject = jest.fn();
    const view = await render(
      <InvitationDetail
        accepting={false}
        invitation={pendingInvitation}
        onAccept={onAccept}
        onBack={jest.fn()}
        onReject={onReject}
        rejecting={false}
      />,
    );

    await fireEvent.press(view.getByText('수락'));
    await fireEvent.press(view.getByText('거절'));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('처리된 초대에서는 mutation action 대신 완료 상태와 뒤로가기를 표시한다', async () => {
    const onBack = jest.fn();
    const view = await render(
      <InvitationDetail
        accepting={false}
        invitation={{
          ...pendingInvitation,
          status: 'rejected',
          expiresAt: '2020-10-07T00:00:00.000Z',
        }}
        onAccept={jest.fn()}
        onBack={onBack}
        onReject={jest.fn()}
        rejecting={false}
      />,
    );

    expect(view.getByText('이 초대를 거절했습니다.')).toBeTruthy();
    expect(view.getByText('거절됨')).toBeTruthy();
    expect(view.queryByText('만료됨')).toBeNull();
    expect(view.queryByText('수락')).toBeNull();
    expect(view.queryByText('거절')).toBeNull();

    await fireEvent.press(view.getByText('이전 화면으로'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
