import { useRouter } from 'expo-router';

import {
  getOrganizationsControllerGetActiveQueryKey,
  useOrganizationsControllerGetActiveSuspense,
  useOrganizationsControllerListSuspense,
  useOrganizationsControllerSetActive,
} from '@repo/client/api-client';
import { DropdownMenuItem } from '@repo/client/rnr/components/ui/dropdown-menu';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';

import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';

// 조직 전환 dropdown 안의 내 조직 목록이다. 다른 조직을 누르면 활성 조직을 바꾸고 홈으로 이동한다.
export function OrganizationSwitcherItems({
  onSwitched,
}: {
  onSwitched?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const organizations = useOrganizationsControllerListSuspense().data.items;
  const activeOrganizationId =
    useOrganizationsControllerGetActiveSuspense().data.activeOrganization
      ?.organization.id;
  const notifyError = useMutationErrorNotification({
    fallback: '잠시 후 다시 시도해 주세요.',
    title: '조직을 전환하지 못했습니다',
  });
  const mutation = useOrganizationsControllerSetActive({
    mutation: { onError: notifyError },
  });

  const switchOrganization = async (organizationId: string) => {
    if (organizationId === activeOrganizationId || mutation.isPending) return;
    try {
      await mutation.mutateAsync({ data: { organizationId } });
    } catch {
      // 오류 알림은 mutation onError에서 처리한다.
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: getOrganizationsControllerGetActiveQueryKey(),
    });
    onSwitched?.();
    router.replace('/');
  };

  if (organizations.length === 0) {
    return (
      <DropdownMenuItem disabled>
        <Text className="text-xs text-muted-foreground">
          아직 속한 조직이 없습니다.
        </Text>
      </DropdownMenuItem>
    );
  }

  return organizations.map((organization) => {
    const active = organization.id === activeOrganizationId;
    return (
      <DropdownMenuItem
        accessibilityState={{ selected: active }}
        className="justify-between"
        key={organization.id}
        onPress={() => void switchOrganization(organization.id)}
      >
        <Text className="min-w-0 flex-1 truncate text-xs">
          {organization.name}
        </Text>
        {active ? (
          <Icon as={Check} className="size-3.5 text-muted-foreground" />
        ) : null}
      </DropdownMenuItem>
    );
  });
}
