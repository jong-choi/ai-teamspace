import { ActivityIndicator } from 'react-native';

import type { OrganizationMember } from '@repo/client/api-client/schemas';
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
import { DIALOG_WIDTH } from '@core/app/ui/dialog-width';

export function RemoveOrganizationMemberDialog({
  member,
  onConfirm,
  onOpenChange,
  open,
  organizationName,
  pending,
}: {
  member: OrganizationMember | null;
  onConfirm: (member: OrganizationMember) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationName: string;
  pending: boolean;
}) {
  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent className={DIALOG_WIDTH.lg}>
        <DialogHeader>
          <DialogTitle>조직에서 멤버 제거</DialogTitle>
          <DialogDescription>
            {member
              ? `${organizationName}에서 ${member.user.name} (${member.user.email}) 멤버를 제거합니다.`
              : '선택한 멤버를 조직에서 제거합니다.'}
          </DialogDescription>
        </DialogHeader>

        <Text className="text-xs leading-5 text-muted-foreground">
          제거 후에는 이 멤버의 조직 접근 권한이 사라집니다. 다시 참여하려면
          별도의 초대 또는 멤버 추가 절차가 필요합니다.
        </Text>

        <DialogFooter>
          <Button
            disabled={pending}
            onPress={() => onOpenChange(false)}
            variant="outline"
          >
            <Text>취소</Text>
          </Button>
          <Button
            disabled={!member || pending}
            onPress={() => {
              if (member) onConfirm(member);
            }}
            variant="destructive"
          >
            {pending ? <ActivityIndicator size="small" /> : null}
            <Text>멤버 제거</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
