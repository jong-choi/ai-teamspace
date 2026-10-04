import {
  createOrganizationMemberQueryParams,
  ORGANIZATION_MEMBER_PAGE_SIZE,
} from '@core/features/organizations/organization-member-filters';
import {
  ORGANIZATION_MEMBER_ROLES,
  parseOrganizationMemberRole,
} from '@core/features/organizations/organization-member-model';

import { describe, expect, it } from '@jest/globals';

describe('조직 멤버 필터 계약', () => {
  it('공백 검색어는 서버 query에서 제외한다', () => {
    expect(
      createOrganizationMemberQueryParams({
        pageIndex: 0,
        search: '   ',
      }),
    ).toEqual({
      limit: ORGANIZATION_MEMBER_PAGE_SIZE,
      offset: 0,
      search: undefined,
      role: undefined,
    });
  });

  it('페이지 인덱스를 canonical offset pagination으로 변환한다', () => {
    expect(
      createOrganizationMemberQueryParams({
        pageIndex: 2,
        role: 'admin',
        search: '  kim  ',
      }),
    ).toEqual({
      limit: ORGANIZATION_MEMBER_PAGE_SIZE,
      offset: ORGANIZATION_MEMBER_PAGE_SIZE * 2,
      role: 'admin',
      search: 'kim',
    });
  });

  it('generated role schema에 owner admin member만 존재한다', () => {
    expect(ORGANIZATION_MEMBER_ROLES).toEqual(['owner', 'admin', 'member']);
    expect(parseOrganizationMemberRole('guest')).toBeUndefined();
  });
});
