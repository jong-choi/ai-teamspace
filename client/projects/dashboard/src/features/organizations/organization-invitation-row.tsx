import { View } from 'react-native';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  getOrganizationInvitationRecipientLabel,
  type PendingOrganizationInvitation,
} from '@core/features/organizations/organization-invitation-model';
import { getOrganizationMemberRoleLabel } from '@core/features/organizations/organization-member-model';

import { RefreshCw, X } from 'lucide-react-native';

export function OrganizationInvitationRow({
  invitation,
  cancelPending,
  resendPending,
  onRequestCancel,
  onResend,
}: {
  invitation: PendingOrganizationInvitation;
  cancelPending: boolean;
  resendPending: boolean;
  onRequestCancel: (invitation: PendingOrganizationInvitation) => void;
  onResend: (invitationId: string) => void;
}) {
  const recipientLabel = getOrganizationInvitationRecipientLabel(invitation);
  const actionPending = cancelPending || resendPending;

  return (
    <View className="min-w-[880px] flex-row items-center border-b border-border/70 px-5 py-3.5 last:border-b-0 web:hover:bg-muted/40">
      <View className="min-w-[280px] flex-1 flex-row items-center gap-3 pr-4">
        <Avatar alt={`${recipientLabel} 초대`} className="size-8">
          {invitation.recipient.image ? (
            <AvatarImage source={{ uri: invitation.recipient.image }} />
          ) : null}
          <AvatarFallback>
            <Text className="text-xs font-semibold text-muted-foreground">
              {getInitials(recipientLabel)}
            </Text>
          </AvatarFallback>
        </Avatar>
        <View className="min-w-0 flex-1">
          <Text className="truncate text-xs font-semibold">
            {recipientLabel}
          </Text>
          <Text className="truncate text-xs text-muted-foreground">
            {invitation.recipient.email}
          </Text>
          {invitation.recipient.username ? (
            <Text className="mt-0.5 text-2xs text-muted-foreground/80">
              @{invitation.recipient.username}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="w-[150px] pr-4">
        <View className="self-start rounded-md border border-border bg-muted/70 px-2 py-1">
          <Text className="text-xs font-medium">
            {getOrganizationMemberRoleLabel(invitation.role)}
          </Text>
        </View>
      </View>

      <View className="w-[120px]">
        <View className="self-start rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1">
          <Text className="text-2xs font-semibold text-amber-700 dark:text-amber-300">
            초대 대기중
          </Text>
        </View>
      </View>

      <NeutralCell className="w-[120px]" />

      <View className="w-[120px] pr-2">
        <Text className="text-2xs text-muted-foreground">
          초대 {formatDate(invitation.createdAt)}
        </Text>
        <Text className="mt-0.5 text-2xs text-muted-foreground/80">
          만료 {formatDate(invitation.expiresAt)}
        </Text>
      </View>

      <View className="w-[90px] flex-row justify-end gap-0.5 pr-1">
        <Button
          accessibilityLabel={`${recipientLabel} 초대 다시 보내기`}
          className="h-8 w-8"
          disabled={actionPending}
          onPress={() => onResend(invitation.id)}
          size="icon"
          variant="ghost"
        >
          <Icon as={RefreshCw} className="size-4 text-muted-foreground" />
        </Button>
        <Button
          accessibilityLabel={`${recipientLabel} 초대 취소`}
          className="h-8 w-8"
          disabled={actionPending}
          onPress={() => onRequestCancel(invitation)}
          size="icon"
          variant="ghost"
        >
          <Icon as={X} className="size-4 text-muted-foreground" />
        </Button>
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

function getInitials(value: string): string {
  const normalized = value.trim().replace(/^@/, '');
  if (!normalized) return '?';

  const words = normalized.split(/\s+/).slice(0, 2);
  return words
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
