import { useState } from 'react';

import type { OrganizationUserSummary } from '@repo/client/api-client/schemas';
import { CalendarAttendeePicker } from '@core/features/calendar/components/calendar-attendee-picker';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

const mockSelf = {
  id: 'user-1',
  name: '본인',
  email: 'self@example.test',
  image: null,
};
jest.mock('@core/features/organizations/organization-members-query', () => ({
  useOrganizationMemberPage: () => ({
    data: { items: [{ userId: 'user-1', user: mockSelf }] },
  }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
function Picker() {
  const [selected, setSelected] = useState<OrganizationUserSummary[]>([
    mockSelf,
  ]);
  return (
    <CalendarAttendeePicker
      currentUserId="user-1"
      organizationId="org-1"
      selectedMembers={selected}
      onChange={setSelected}
    />
  );
}
describe('회의 참석자 본인 선택', () => {
  it('본인을 목록에서 제거하고 검색하여 다시 추가할 수 있다', async () => {
    const view = await render(<Picker />);
    expect(view.getByText('1명 선택')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('본인 참여자에서 제거'));
    expect(view.getByText('0명 선택')).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('참여자 검색'), '본인');
    // 검색은 입력이 멈춘 뒤 debounce를 거쳐 실행된다.
    await fireEvent.press(await view.findByLabelText('본인 참여자로 추가'));
    expect(view.getByText('1명 선택')).toBeTruthy();
  });
});
