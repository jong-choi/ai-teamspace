import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { OrganizationInvitationsControllerCreateBody } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Select, SelectContent } from '@repo/client/rnr/components/ui/select';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { DashboardInput } from '@core/app/ui/dashboard-input';
import {
  DashboardSelectItem,
  DashboardSelectTrigger,
  DashboardSelectValue,
} from '@core/app/ui/dashboard-select';
import { DIALOG_WIDTH } from '@core/app/ui/dialog-width';
import {
  normalizeOrganizationInvitationUsername,
  ORGANIZATION_INVITATION_ROLES,
  type OrganizationInvitationRole,
  parseOrganizationInvitationRole,
} from '@core/features/organizations/organization-invitation-model';
import { useOrganizationInvitationMutations } from '@core/features/organizations/organization-invitation-mutations';
import { getOrganizationMemberRoleLabel } from '@core/features/organizations/organization-member-model';

import { Send } from 'lucide-react-native';

const ROLE_OPTIONS = ORGANIZATION_INVITATION_ROLES.map((role) => ({
  label: getOrganizationMemberRoleLabel(role),
  value: role,
}));

export function InviteOrganizationMemberDialog({
  onOpenChange,
  open,
  organizationId,
  organizationName,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  organizationName: string;
}) {
  const mutations = useOrganizationInvitationMutations(organizationId);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [role, setRole] = useState<OrganizationInvitationRole>('member');
  const normalizedUsername =
    normalizeOrganizationInvitationUsername(recipientUsername);
  const selectedRole = useMemo(
    () => ROLE_OPTIONS.find((option) => option.value === role),
    [role],
  );

  const reset = () => {
    setRecipientUsername('');
    setRole('member');
  };
  const close = () => {
    if (mutations.creating) return;
    reset();
    onOpenChange(false);
  };
  const submit = () => {
    if (!normalizedUsername || mutations.creating) return;

    const body = OrganizationInvitationsControllerCreateBody.parse({
      recipientUsername: normalizedUsername,
      role,
    });
    mutations.create(body, () => {
      reset();
      onOpenChange(false);
    });
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
      open={open}
    >
      <DialogContent className={cn('gap-0 rounded-xl p-0', DIALOG_WIDTH.lg)}>
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6 pr-12">
          <DialogTitle className="text-base">조직에 새 멤버 초대</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            정확한 사용자명으로 {organizationName} 조직 초대를 보냅니다.
          </DialogDescription>
        </DialogHeader>

        <View className="gap-4 px-6 py-5">
          <View className="gap-1.5">
            <Text className="text-xs font-medium">사용자명</Text>
            <DashboardInput
              accessibilityLabel="초대할 사용자명"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!mutations.creating}
              maxLength={255}
              onChangeText={setRecipientUsername}
              onSubmitEditing={submit}
              placeholder="사용자명"
              value={recipientUsername}
            />
            <Text className="text-xs leading-4 text-muted-foreground">
              사용자 검색이나 자동완성 없이 정확한 사용자명을 입력합니다.
            </Text>
          </View>

          <View className="gap-1.5">
            <Text className="text-xs font-medium">역할</Text>
            <Select
              disabled={mutations.creating}
              onValueChange={(option) => {
                const nextRole = parseOrganizationInvitationRole(option?.value);
                if (nextRole) setRole(nextRole);
              }}
              value={selectedRole}
            >
              <DashboardSelectTrigger accessibilityLabel="초대 역할 선택">
                <DashboardSelectValue placeholder="역할 선택" />
              </DashboardSelectTrigger>
              <SelectContent align="start" side="bottom">
                {ROLE_OPTIONS.map((option) => (
                  <DashboardSelectItem
                    key={option.value}
                    label={option.label}
                    value={option.value}
                  >
                    {option.label}
                  </DashboardSelectItem>
                ))}
              </SelectContent>
            </Select>
          </View>
        </View>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button
            disabled={mutations.creating}
            onPress={close}
            size="sm"
            variant="outline"
          >
            <Text className="text-xs">취소</Text>
          </Button>
          <Button
            disabled={!normalizedUsername || mutations.creating}
            onPress={submit}
            size="sm"
          >
            {mutations.creating ? (
              <ActivityIndicator size="small" />
            ) : (
              <Icon as={Send} className="size-3.5 text-primary-foreground" />
            )}
            <Text className="text-xs text-primary-foreground">
              {mutations.creating ? '전송 중' : '초대 보내기'}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
