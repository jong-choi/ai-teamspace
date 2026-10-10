import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type { OrganizationMember } from '@repo/client/api-client/schemas';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDebouncedValue } from '@core/app/hooks/use-debounced-value';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { DashboardSearchInput } from '@core/app/ui/dashboard-search-input';
import { useOrganizationMemberPage } from '@core/features/organizations/organization-members-query';

import { CornerDownLeft, UserPlus } from 'lucide-react-native';

const SEARCH_DEBOUNCE_MS = 300;

// 조직 멤버 자동완성이다. 입력이 멈춘 뒤 이름·이메일·사용자명으로 검색하고, 고르면 입력을 비운다.
// 결과는 최대 높이 안에서 스크롤된다.
export function OrganizationMemberSearch({
  accessibilityLabel,
  disabled = false,
  excludedUserIds,
  floating = false,
  onSelect,
  onUseTypedValue,
  organizationId,
  placeholder,
  selectLabel,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  excludedUserIds: readonly string[];
  // true면 결과를 입력 아래에 띄워 주변 layout을 밀지 않는다. 감싸는 쪽이 뒤 형제보다 높은 z-index를 줘야 한다.
  floating?: boolean;
  onSelect: (member: OrganizationMember) => void;
  // 주면 검색 결과가 없을 때 입력한 글자를 그대로 쓰는 "직접 입력" 항목을 보여 준다.
  onUseTypedValue?: (value: string) => void;
  organizationId: string;
  placeholder: string;
  selectLabel: (name: string) => string;
}) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  // 입력을 비우면 debounce를 기다리지 않고 결과를 바로 닫는다.
  const activeSearch = search.trim() ? debouncedSearch : '';

  return (
    <View className={cn('gap-2', floating && 'relative z-20')}>
      <DashboardSearchInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        editable={!disabled}
        maxLength={100}
        onChangeText={setSearch}
        placeholder={placeholder}
        value={search}
      />

      {activeSearch.length > 0 ? (
        <View
          className={cn(
            floating &&
              'absolute left-0 right-0 top-full z-20 mt-1 rounded-lg bg-popover shadow-md shadow-black/10',
          )}
        >
          <DashboardQueryBoundary
            errorFallbackClassName="min-h-24 rounded-lg border border-border"
            fallback={
              <DashboardLoading
                className="min-h-24 rounded-lg border border-border"
                label="멤버를 검색하는 중..."
              />
            }
            resetKeys={[organizationId, activeSearch]}
            title="멤버 검색을 불러오지 못했습니다"
          >
            <OrganizationMemberSearchResults
              excludedUserIds={excludedUserIds}
              onSelect={(member) => {
                onSelect(member);
                setSearch('');
              }}
              onUseTypedValue={
                onUseTypedValue
                  ? (value) => {
                      onUseTypedValue(value);
                      setSearch('');
                    }
                  : undefined
              }
              organizationId={organizationId}
              search={activeSearch}
              selectLabel={selectLabel}
            />
          </DashboardQueryBoundary>
        </View>
      ) : null}
    </View>
  );
}

function OrganizationMemberSearchResults({
  excludedUserIds,
  onSelect,
  onUseTypedValue,
  organizationId,
  search,
  selectLabel,
}: {
  excludedUserIds: readonly string[];
  onSelect: (member: OrganizationMember) => void;
  onUseTypedValue?: (value: string) => void;
  organizationId: string;
  search: string;
  selectLabel: (name: string) => string;
}) {
  const members = useOrganizationMemberPage(organizationId, {
    limit: 100,
    offset: 0,
    search,
  }).data.items;
  const selectableMembers = members.filter(
    (member) => !excludedUserIds.includes(member.userId),
  );

  return (
    <ScrollView
      className="max-h-44 rounded-lg border border-border bg-card"
      contentContainerClassName="gap-1 p-1.5"
      keyboardShouldPersistTaps="handled"
    >
      {selectableMembers.map((member) => (
        <Pressable
          accessibilityLabel={selectLabel(member.user.name)}
          className="flex-row items-center gap-2 rounded-md px-2 py-1.5 web:hover:bg-accent"
          key={member.userId}
          onPress={() => onSelect(member)}
        >
          <OrganizationMemberAvatar
            image={member.user.image}
            name={member.user.name}
          />
          <View className="min-w-0 flex-1">
            <Text className="truncate text-xs font-medium">
              {member.user.name}
            </Text>
            <Text className="truncate text-2xs text-muted-foreground">
              {member.user.email}
            </Text>
          </View>
          <Icon as={UserPlus} className="size-3.5 text-muted-foreground" />
        </Pressable>
      ))}
      {selectableMembers.length > 0 ? null : onUseTypedValue ? (
        <Pressable
          accessibilityLabel={`${search} 직접 입력`}
          className="flex-row items-center gap-2 rounded-md px-2 py-2 web:hover:bg-accent"
          onPress={() => onUseTypedValue(search)}
        >
          <Icon
            as={CornerDownLeft}
            className="size-3.5 text-muted-foreground"
          />
          <Text className="min-w-0 flex-1 truncate text-xs">
            ‘{search}’ 직접 입력
          </Text>
        </Pressable>
      ) : (
        <Text className="px-2 py-2 text-xs text-muted-foreground">
          검색 결과가 없습니다.
        </Text>
      )}
    </ScrollView>
  );
}

export function OrganizationMemberAvatar({
  compact = false,
  image,
  name,
}: {
  compact?: boolean;
  image: string | null;
  name: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <Avatar alt={name} className={compact ? 'size-4' : 'size-7'}>
      {image ? <AvatarImage source={{ uri: image }} /> : null}
      <AvatarFallback>
        <Text
          className={compact ? 'text-3xs font-bold' : 'text-3xs font-semibold'}
        >
          {initials || '?'}
        </Text>
      </AvatarFallback>
    </Avatar>
  );
}
