import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import type {
  OrganizationAccess,
  OrganizationMember,
} from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';
import type { OrganizationMemberFilters } from '@core/features/organizations/organization-member-filters';
import type { OrganizationMemberRole } from '@core/features/organizations/organization-member-model';
import { useOrganizationMemberMutations } from '@core/features/organizations/organization-member-mutations';
import { OrganizationMemberRow } from '@core/features/organizations/organization-member-row';
import { useOrganizationMemberPage } from '@core/features/organizations/organization-members-query';
import { RemoveOrganizationMemberDialog } from '@core/features/organizations/remove-organization-member-dialog';

export function OrganizationMemberList({
  actorRole,
  actorUserId,
  filters,
  organizationId,
  organizationName,
}: {
  actorRole: OrganizationAccess['role'];
  actorUserId: string;
  filters: OrganizationMemberFilters;
  organizationId: string;
  organizationName: string;
}) {
  const page = useOrganizationMemberPage(organizationId, filters.params).data;
  const mutations = useOrganizationMemberMutations(organizationId);
  const [memberToRemove, setMemberToRemove] =
    useState<OrganizationMember | null>(null);
  const firstItem = page.total === 0 ? 0 : page.offset + 1;
  const lastItem = page.offset + page.items.length;
  const canGoPrevious = filters.pageIndex > 0;
  const canGoNext = lastItem < page.total;
  const handleRoleChange = (
    member: OrganizationMember,
    role: OrganizationMemberRole,
  ) => {
    mutations.changeRole(member.id, role);
  };

  const handleRemove = (member: OrganizationMember) => {
    mutations.removeMember(member.id, () => setMemberToRemove(null));
  };

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View className="min-w-[880px]">
          <OrganizationMemberListHeader />
          {page.items.length > 0 ? (
            page.items.map((member) => (
              <OrganizationMemberRow
                actorRole={actorRole}
                actorUserId={actorUserId}
                key={member.id}
                member={member}
                mutationPending={mutations.isPending}
                onChangeRole={handleRoleChange}
                onRequestRemove={setMemberToRemove}
              />
            ))
          ) : (
            <View className="min-h-40 items-center justify-center px-6 py-10">
              <Text className="text-xs font-medium">
                표시할 멤버가 없습니다
              </Text>
              <Text className="mt-1 text-[11px] text-muted-foreground">
                검색어나 역할 필터를 변경해 보세요.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View className="gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <Text className="text-xs text-muted-foreground">
          {page.total === 0
            ? '멤버 0명'
            : `${page.total}명 중 ${firstItem}-${lastItem}명`}
        </Text>
        <View className="flex-row items-center gap-1">
          <Button
            className="h-7 px-2"
            disabled={!canGoPrevious || mutations.isPending}
            onPress={() => filters.setPageIndex(filters.pageIndex - 1)}
            size="sm"
            variant="outline"
          >
            <Text className="text-xs">이전</Text>
          </Button>
          <View className="h-7 min-w-7 items-center justify-center rounded-md bg-muted px-2">
            <Text className="text-xs font-medium">{filters.pageIndex + 1}</Text>
          </View>
          <Button
            className="h-7 px-2"
            disabled={!canGoNext || mutations.isPending}
            onPress={() => filters.setPageIndex(filters.pageIndex + 1)}
            size="sm"
            variant="outline"
          >
            <Text className="text-xs">다음</Text>
          </Button>
        </View>
      </View>

      <RemoveOrganizationMemberDialog
        member={memberToRemove}
        onConfirm={handleRemove}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null);
        }}
        open={memberToRemove !== null}
        organizationName={organizationName}
        pending={mutations.isPending}
      />
    </View>
  );
}

function OrganizationMemberListHeader() {
  return (
    <View className="min-w-[880px] flex-row border-b border-border bg-muted/50 px-5 py-3">
      <HeaderCell className="w-[280px] pr-4" label="멤버 정보" />
      <HeaderCell className="w-[150px] pr-4" label="역할 권한" />
      <HeaderCell className="w-[120px]" label="가입 상태" />
      <HeaderCell className="w-[120px]" label="소속 팀" />
      <HeaderCell className="w-[120px]" label="최근 활동" />
      <HeaderCell className="w-[90px] items-end pr-1" label="작업" />
    </View>
  );
}

function HeaderCell({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <View className={className}>
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}
