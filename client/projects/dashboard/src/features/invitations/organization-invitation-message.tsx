import { View } from 'react-native';

import type { ChatMessage } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';

import { Building2 } from 'lucide-react-native';

type OrganizationInvitationMessageContent = Extract<
  ChatMessage['content'],
  { type: 'organization_invitation' }
>;

export function OrganizationInvitationMessage({
  content,
  onOpenInvitation,
}: {
  content: OrganizationInvitationMessageContent;
  onOpenInvitation: (invitationId: string) => void;
}) {
  const inviter = content.inviterDisplayNameAtSend?.trim() || '누군가';
  const organization = content.organizationNameAtSend?.trim() || '조직';

  return (
    <View className="max-w-xl gap-3 rounded-xl border border-border bg-muted/30 p-4">
      <View className="flex-row items-center gap-2">
        <View className="size-7 items-center justify-center rounded-lg bg-muted">
          <Icon as={Building2} className="size-3.5 text-muted-foreground" />
        </View>
        <Text className="text-xs font-semibold">조직 초대</Text>
      </View>
      <Text className="text-xs leading-5 text-foreground/90">
        {inviter}님이 {organization} 조직에 초대했습니다.
      </Text>
      <Button
        className="self-start"
        onPress={() => onOpenInvitation(content.invitationId)}
        size="sm"
        variant="outline"
      >
        <Text className="text-xs">초대 확인</Text>
      </Button>
    </View>
  );
}
