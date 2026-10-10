import { View } from 'react-native';

import type {
  OrganizationAccess,
  OrganizationMember,
} from '@repo/client/api-client/schemas';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  getOrganizationMemberRoleLabel,
  type OrganizationMemberRole,
} from '@core/features/organizations/organization-member-model';
import { getOrganizationMemberManagementPermissions } from '@core/features/organizations/organization-member-permissions';
import { OrganizationMemberRoleSelect } from '@core/features/organizations/organization-member-role-select';

import { Trash2 } from 'lucide-react-native';

export function OrganizationMemberRow({
  actorRole,
  actorUserId,
  member,
  mutationPending,
  onChangeRole,
  onRequestRemove,
}: {
  actorRole: OrganizationAccess['role'];
  actorUserId: string;
  member: OrganizationMember;
  mutationPending: boolean;
  onChangeRole: (
    member: OrganizationMember,
    role: OrganizationMemberRole,
  ) => void;
  onRequestRemove: (member: OrganizationMember) => void;
}) {
  const permissions = getOrganizationMemberManagementPermissions({
    actorRole,
    actorUserId,
    target: member,
  });

  return (
    <View className="min-w-[880px] flex-row items-center border-b border-border/70 px-5 py-3.5 last:border-b-0 web:hover:bg-muted/40">
      <View className="min-w-[280px] flex-1 flex-row items-center gap-3 pr-4">
        <Avatar alt={`${member.user.name} 아바타`} className="size-8">
          {member.user.image ? (
            <AvatarImage source={{ uri: member.user.image }} />
          ) : null}
          <AvatarFallback>
            <Text className="text-[11px] font-semibold text-muted-foreground">
              {getInitials(member.user.name)}
            </Text>
          </AvatarFallback>
        </Avatar>
        <View className="min-w-0 flex-1">
          <Text className="truncate text-xs font-semibold">
            {member.user.name}
          </Text>
          <Text className="truncate text-[11px] text-muted-foreground">
            {member.user.email}
          </Text>
          <Text className="mt-0.5 text-[10px] text-muted-foreground/80">
            가입 {formatJoinedAt(member.createdAt)}
          </Text>
        </View>
      </View>

      <View className="w-[150px] pr-4">
        {permissions.canChangeRole ? (
          <OrganizationMemberRoleSelect
            actorRole={actorRole}
            disabled={mutationPending}
            member={member}
            onRoleChange={(role) => onChangeRole(member, role)}
          />
        ) : (
          <View className="self-start rounded-md border border-border bg-muted/70 px-2 py-1">
            <Text className="text-[11px] font-medium">
              {getOrganizationMemberRoleLabel(member.role)}
            </Text>
          </View>
        )}
      </View>

      <NeutralCell className="w-[120px]" />
      <NeutralCell className="w-[120px]" />
      <NeutralCell className="w-[120px]" />
      <View className="w-[90px] items-end pr-1">
        {permissions.canRemove ? (
          <Button
            accessibilityLabel={`${member.user.name} 멤버 제거`}
            className="h-8 w-8"
            disabled={mutationPending}
            onPress={() => onRequestRemove(member)}
            size="icon"
            variant="ghost"
          >
            <Icon as={Trash2} className="size-4 text-muted-foreground" />
          </Button>
        ) : (
          <Text className="text-xs text-muted-foreground">—</Text>
        )}
      </View>
    </View>
  );
}

function NeutralCell({ className }: { className: string }) {
  return (
    <View className={className}>
      <Text className="text-xs text-muted-foreground">—</Text>
    </View>
  );
}

function getInitials(name: string): string {
  const normalized = name.trim();
  if (!normalized) return '?';

  const words = normalized.split(/\s+/).slice(0, 2);
  return words
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function formatJoinedAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
  }).format(new Date(value));
}
