import { View } from 'react-native';

import { Select, SelectContent } from '@repo/client/rnr/components/ui/select';
import { Text } from '@repo/client/rnr/components/ui/text';
import { DashboardSearchInput } from '@core/app/ui/dashboard-search-input';
import {
  DashboardSelectItem,
  DashboardSelectTrigger,
  DashboardSelectValue,
} from '@core/app/ui/dashboard-select';
import type { OrganizationMemberFilters } from '@core/features/organizations/organization-member-filters';
import {
  getOrganizationMemberRoleLabel,
  ORGANIZATION_MEMBER_ROLES,
  parseOrganizationMemberRole,
} from '@core/features/organizations/organization-member-model';

const ALL_ROLE_OPTION = {
  label: '전체 역할',
  value: 'all',
};

const ROLE_OPTIONS = ORGANIZATION_MEMBER_ROLES.map((role) => ({
  label: getOrganizationMemberRoleLabel(role),
  value: role,
}));

export function OrganizationMemberToolbar({
  filters,
}: {
  filters: OrganizationMemberFilters;
}) {
  const selectedRole = filters.role
    ? ROLE_OPTIONS.find((option) => option.value === filters.role)
    : ALL_ROLE_OPTION;

  return (
    <View className="flex-row flex-wrap items-center justify-between gap-3 border-b border-border p-4">
      <DashboardSearchInput
        accessibilityLabel="멤버 검색"
        className="min-w-[200px] max-w-sm flex-1"
        maxLength={100}
        onChangeText={filters.setSearchInput}
        placeholder="등록 멤버 이름 또는 이메일 검색..."
        value={filters.searchInput}
      />

      <View className="flex-row items-center gap-2">
        <Text className="text-xs font-medium text-muted-foreground">
          멤버 역할:
        </Text>
        <Select
          onValueChange={(option) => {
            filters.setRole(
              option?.value === ALL_ROLE_OPTION.value
                ? undefined
                : parseOrganizationMemberRole(option?.value),
            );
          }}
          value={selectedRole}
        >
          <DashboardSelectTrigger className="min-w-32" size="sm">
            <DashboardSelectValue placeholder="전체 역할" />
          </DashboardSelectTrigger>
          <SelectContent align="end" side="bottom">
            <DashboardSelectItem
              label={ALL_ROLE_OPTION.label}
              value={ALL_ROLE_OPTION.value}
            >
              {ALL_ROLE_OPTION.label}
            </DashboardSelectItem>
            {ROLE_OPTIONS.map((option) => (
              <DashboardSelectItem
                key={option.value}
                label={option.label}
                value={option.value}
              >
                {option.label}
              </DashboardSelectItem>
            ))}
          </SelectContent>
        </Select>
      </View>
    </View>
  );
}
