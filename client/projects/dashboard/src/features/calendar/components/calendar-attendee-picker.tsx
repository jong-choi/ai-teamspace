import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { OrganizationMember } from '@repo/client/api-client/schemas';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { useCalendarMembers } from '@core/features/calendar/calendar-query';

import { Search, UserPlus, Users, X } from 'lucide-react-native';

export function CalendarAttendeePicker({
  currentUserId,
  onChange,
  organizationId,
  selectedMembers,
}: {
  currentUserId: string;
  onChange: (members: OrganizationMember[]) => void;
  organizationId: string;
  selectedMembers: OrganizationMember[];
}) {
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim();

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Icon as={Users} className="size-3.5 text-muted-foreground" />
          <Text className="text-[11px] font-semibold text-muted-foreground">
            참여자 지정
          </Text>
        </View>
        <Text className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          {selectedMembers.length}명 선택
        </Text>
      </View>

      <View className="min-h-9 flex-row flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/20 p-2">
        {selectedMembers.length === 0 ? (
          <Text className="py-0.5 text-xs text-muted-foreground">
            참여자를 검색하여 추가해 주세요.
          </Text>
        ) : (
          selectedMembers.map((member) => (
            <Pressable
              accessibilityLabel={`${member.user.name} 참여자에서 제거`}
              className="flex-row items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 shadow-sm shadow-black/5"
              key={member.userId}
              onPress={() =>
                onChange(
                  selectedMembers.filter(
                    (selected) => selected.userId !== member.userId,
                  ),
                )
              }
            >
              <MemberAvatar
                compact
                image={member.user.image}
                name={member.user.name}
              />
              <Text className="text-[10px] font-medium">
                {member.user.name}
              </Text>
              <Text className="text-[9px] text-muted-foreground">
                ({memberRoleLabel(member.role)})
              </Text>
              <Icon as={X} className="size-3 text-muted-foreground" />
            </Pressable>
          ))
        )}
      </View>

      <View className="relative">
        <Icon
          as={Search}
          className="pointer-events-none absolute left-2.5 top-2.5 z-10 size-3.5 text-muted-foreground"
        />
        <Input
          accessibilityLabel="참여자 검색"
          className="h-9 pl-8 text-xs"
          maxLength={100}
          onChangeText={setSearch}
          placeholder="이름 또는 이메일로 조직 멤버 검색..."
          value={search}
        />
      </View>

      {normalizedSearch.length > 0 ? (
        <DashboardQueryBoundary
          errorFallbackClassName="min-h-24 rounded-lg border border-border"
          fallback={
            <DashboardLoading
              className="min-h-24 rounded-lg border border-border"
              label="멤버를 검색하는 중..."
            />
          }
          resetKeys={[organizationId, normalizedSearch]}
          title="멤버 검색을 불러오지 못했습니다"
        >
          <CalendarAttendeeSearchResults
            currentUserId={currentUserId}
            onSelect={(member) => {
              onChange([...selectedMembers, member]);
              setSearch('');
            }}
            organizationId={organizationId}
            search={normalizedSearch}
            selectedMembers={selectedMembers}
          />
        </DashboardQueryBoundary>
      ) : null}
    </View>
  );
}

function CalendarAttendeeSearchResults({
  currentUserId,
  onSelect,
  organizationId,
  search,
  selectedMembers,
}: {
  currentUserId: string;
  onSelect: (member: OrganizationMember) => void;
  organizationId: string;
  search: string;
  selectedMembers: readonly OrganizationMember[];
}) {
  const members = useCalendarMembers(organizationId, search).data.items;
  const selectableMembers = members.filter(
    (member) =>
      member.userId !== currentUserId &&
      !selectedMembers.some((selected) => selected.userId === member.userId),
  );

  return (
    <View className="max-h-44 gap-1 rounded-lg border border-border bg-card p-1.5 shadow-lg shadow-black/5">
      {selectableMembers.slice(0, 8).map((member) => (
        <Pressable
          accessibilityLabel={`${member.user.name} 참여자로 추가`}
          className="flex-row items-center gap-2 rounded-md px-2 py-1.5 web:hover:bg-accent"
          key={member.userId}
          onPress={() => onSelect(member)}
        >
          <MemberAvatar image={member.user.image} name={member.user.name} />
          <View className="min-w-0 flex-1">
            <Text className="truncate text-xs font-medium">
              {member.user.name}
            </Text>
            <Text className="truncate text-[10px] text-muted-foreground">
              {member.user.email}
            </Text>
          </View>
          <Icon as={UserPlus} className="size-3.5 text-muted-foreground" />
        </Pressable>
      ))}
      {selectableMembers.length === 0 ? (
        <Text className="px-2 py-2 text-xs text-muted-foreground">
          검색 결과가 없습니다.
        </Text>
      ) : null}
    </View>
  );
}

function memberRoleLabel(role: OrganizationMember['role']): string {
  if (role === 'owner') return '소유자';
  if (role === 'admin') return '관리자';
  return '멤버';
}

function MemberAvatar({
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
          className={
            compact ? 'text-[7px] font-bold' : 'text-[9px] font-semibold'
          }
        >
          {initials || '?'}
        </Text>
      </AvatarFallback>
    </Avatar>
  );
}
