import { ActivityIndicator } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { DIALOG_WIDTH } from '@core/app/ui/dialog-width';
import {
  getOrganizationInvitationRecipientLabel,
  type PendingOrganizationInvitation,
} from '@core/features/organizations/organization-invitation-model';

export function CancelOrganizationInvitationDialog({
  invitation,
  onConfirm,
  onOpenChange,
  open,
  organizationName,
  pending,
}: {
  invitation: PendingOrganizationInvitation | null;
  onConfirm: (invitation: PendingOrganizationInvitation) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationName: string;
  pending: boolean;
}) {
  const recipient = invitation
    ? getOrganizationInvitationRecipientLabel(invitation)
    : null;

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent className={cn('rounded-xl', DIALOG_WIDTH.lg)}>
        <DialogHeader>
          <DialogTitle>조직 초대 취소</DialogTitle>
          <DialogDescription>
            {recipient
              ? `${organizationName} 조직의 ${recipient} 초대를 취소합니다.`
              : '선택한 조직 초대를 취소합니다.'}
          </DialogDescription>
        </DialogHeader>

        <Text className="text-xs leading-5 text-muted-foreground">
          취소한 초대는 더 이상 수락할 수 없습니다. 다시 초대하려면 새 초대를
          보내야 합니다.
        </Text>

        <DialogFooter>
          <Button
            disabled={pending}
            onPress={() => onOpenChange(false)}
            variant="outline"
          >
            <Text>닫기</Text>
          </Button>
          <Button
            disabled={!invitation || pending}
            onPress={() => {
              if (invitation) onConfirm(invitation);
            }}
            variant="destructive"
          >
            {pending ? <ActivityIndicator size="small" /> : null}
            <Text>초대 취소</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
