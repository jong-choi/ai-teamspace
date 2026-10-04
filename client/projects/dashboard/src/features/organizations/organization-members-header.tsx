import { useState } from 'react';
import { View } from 'react-native';

import type { OrganizationAccess } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { InviteOrganizationMemberDialog } from '@core/features/organizations/invite-organization-member-dialog';
import { getOrganizationMemberRoleLabel } from '@core/features/organizations/organization-member-model';
import { canManageOrganizationInvitations } from '@core/features/organizations/organization-member-permissions';

import { UserPlus } from 'lucide-react-native';

export function OrganizationMembersHeader({
  access,
  organizationId,
}: {
  access: OrganizationAccess;
  organizationId: string;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const canInvite = canManageOrganizationInvitations(access.role);

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text className="text-xs font-semibold text-foreground">
          {access.organization.name}
        </Text>
        <Text className="text-xs text-muted-foreground">›</Text>
        <Text className="text-xs text-muted-foreground">조직 멤버 관리</Text>
      </View>

      <View className="min-w-0 gap-4 sm:flex-row sm:items-start sm:justify-between">
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
            조직 구성원과 역할 정보를 확인하고 대기 중인 초대를 관리합니다.
          </Text>
        </View>

        {canInvite ? (
          <Button
            className="self-start"
            onPress={() => setInviteOpen(true)}
            size="sm"
          >
            <Icon as={UserPlus} className="size-3.5 text-primary-foreground" />
            <Text className="text-xs text-primary-foreground">
              새 멤버 초대
            </Text>
          </Button>
        ) : null}
      </View>

      {canInvite ? (
        <InviteOrganizationMemberDialog
          onOpenChange={setInviteOpen}
          open={inviteOpen}
          organizationId={organizationId}
          organizationName={access.organization.name}
        />
      ) : null}
    </View>
  );
}
