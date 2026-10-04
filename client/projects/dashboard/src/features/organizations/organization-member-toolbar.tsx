import { View } from 'react-native';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { Text } from '@repo/client/rnr/components/ui/text';
import type { OrganizationMemberFilters } from '@core/features/organizations/organization-member-filters';
import {
  getOrganizationMemberRoleLabel,
  ORGANIZATION_MEMBER_ROLES,
  parseOrganizationMemberRole,
} from '@core/features/organizations/organization-member-model';

import { Search } from 'lucide-react-native';

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
    <View className="gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
      <View className="relative w-full max-w-sm flex-1">
        <View className="pointer-events-none absolute inset-y-0 left-3 z-10 justify-center">
          <Icon as={Search} className="size-4 text-muted-foreground" />
        </View>
        <Input
          accessibilityLabel="멤버 검색"
          className="h-8 pl-9 text-xs"
          maxLength={100}
          onChangeText={filters.setSearchInput}
          placeholder="등록 멤버 이름 또는 이메일 검색..."
          value={filters.searchInput}
        />
      </View>

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
          <SelectTrigger className="min-w-32" size="sm">
            <SelectValue placeholder="전체 역할" />
          </SelectTrigger>
          <SelectContent align="end" side="bottom">
            <SelectItem
              label={ALL_ROLE_OPTION.label}
              value={ALL_ROLE_OPTION.value}
            >
              {ALL_ROLE_OPTION.label}
            </SelectItem>
            {ROLE_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                label={option.label}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </View>
    </View>
  );
}
