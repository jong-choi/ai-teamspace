import { useDeferredValue, useState } from 'react';

import type { OrganizationsControllerListMembersParams } from '@repo/client/api-client/schemas';
import { OrganizationsControllerListMembersParams as OrganizationMemberQueryParamsSchema } from '@repo/client/api-client/schemas';
import type { OrganizationMemberRole } from '@core/features/organizations/organization-member-model';

export const ORGANIZATION_MEMBER_PAGE_SIZE = 20;

export type OrganizationMemberFilters = {
  pageIndex: number;
  params: OrganizationsControllerListMembersParams;
  role: OrganizationMemberRole | undefined;
  searchInput: string;
  setPageIndex: (pageIndex: number) => void;
  setRole: (role: OrganizationMemberRole | undefined) => void;
  setSearchInput: (value: string) => void;
};

export function useOrganizationMemberFilters(
  initialSearch = '',
): OrganizationMemberFilters {
  const [searchInput, setSearchInputState] = useState(initialSearch);
  const [role, setRoleState] = useState<OrganizationMemberRole>();
  const [pageIndex, setPageIndex] = useState(0);
  const deferredSearch = useDeferredValue(searchInput.trim());

  const params = createOrganizationMemberQueryParams({
    pageIndex,
    role,
    search: deferredSearch,
  });

  return {
    pageIndex,
    params,
    role,
    searchInput,
    setPageIndex,
    setRole: (nextRole) => {
      setRoleState(nextRole);
      setPageIndex(0);
    },
    setSearchInput: (value) => {
      setSearchInputState(value);
      setPageIndex(0);
    },
  };
}

export function createOrganizationMemberQueryParams(input: {
  pageIndex: number;
  role?: OrganizationMemberRole;
  search?: string;
}): OrganizationsControllerListMembersParams {
  const search = input.search?.trim();

  return OrganizationMemberQueryParamsSchema.parse({
    limit: ORGANIZATION_MEMBER_PAGE_SIZE,
    offset: input.pageIndex * ORGANIZATION_MEMBER_PAGE_SIZE,
    role: input.role,
    search: search ? search : undefined,
  });
}
