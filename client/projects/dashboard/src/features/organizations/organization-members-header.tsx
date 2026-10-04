import { View } from 'react-native';

import type { OrganizationAccess } from '@repo/client/api-client/schemas';
import { Text } from '@repo/client/rnr/components/ui/text';
import { getOrganizationMemberRoleLabel } from '@core/features/organizations/organization-member-model';

export function OrganizationMembersHeader({
  access,
}: {
  access: OrganizationAccess;
}) {
  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text className="text-xs font-semibold text-foreground">
          {access.organization.name}
        </Text>
        <Text className="text-xs text-muted-foreground">›</Text>
        <Text className="text-xs text-muted-foreground">조직 멤버 관리</Text>
      </View>

      <View className="min-w-0 flex-1 sm:flex-row sm:items-start sm:justify-between">
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-xl font-bold tracking-tight sm:text-2xl">
              조직 멤버 관리
            </Text>
            <View className="rounded border border-border bg-muted px-2 py-0.5">
              <Text className="text-[11px] font-semibold text-muted-foreground">
                {getOrganizationMemberRoleLabel(access.role)} 권한
              </Text>
            </View>
          </View>
          <Text className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">
            조직 구성원과 역할 정보를 확인합니다.
          </Text>
        </View>
      </View>
    </View>
  );
}
