import { useState } from 'react';

import type { OrganizationAccess } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  DashboardBreadcrumbItem,
  DashboardBreadcrumbSeparator,
  DashboardPageHeader,
} from '@core/app/shell/dashboard-page-header';
import { InviteOrganizationMemberDialog } from '@core/features/organizations/invite-organization-member-dialog';
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
    <>
      <DashboardPageHeader
        actions={
          canInvite ? (
            <Button onPress={() => setInviteOpen(true)} size="sm">
              <Icon
                as={UserPlus}
                className="size-3.5 text-primary-foreground"
              />
              <Text className="text-xs text-primary-foreground">
                새 멤버 초대
              </Text>
            </Button>
          ) : null
        }
      >
        <DashboardBreadcrumbItem className="max-w-48 truncate">
          {access.organization.name}
        </DashboardBreadcrumbItem>
        <DashboardBreadcrumbSeparator />
        <DashboardBreadcrumbItem current>
          조직 멤버 관리
        </DashboardBreadcrumbItem>
      </DashboardPageHeader>

      {canInvite ? (
        <InviteOrganizationMemberDialog
          onOpenChange={setInviteOpen}
          open={inviteOpen}
          organizationId={organizationId}
          organizationName={access.organization.name}
        />
      ) : null}
    </>
  );
}
