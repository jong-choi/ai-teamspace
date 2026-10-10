import { Pressable, View } from 'react-native';

import type { OrganizationUserSummary } from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  OrganizationMemberAvatar,
  OrganizationMemberSearch,
} from '@core/features/organizations/organization-member-search';

import { Users, X } from 'lucide-react-native';

export function CalendarAttendeePicker({
  currentUserId,
  onChange,
  organizationId,
  selectedMembers,
}: {
  currentUserId: string;
  onChange: (members: OrganizationUserSummary[]) => void;
  organizationId: string;
  selectedMembers: OrganizationUserSummary[];
}) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Icon as={Users} className="size-3.5 text-muted-foreground" />
          <Text className="text-[11px] font-semibold text-muted-foreground">
            참여자 지정
          </Text>
        </View>
        <Text className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          {selectedMembers.length}명 선택
        </Text>
      </View>

      <View className="min-h-9 flex-row flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/20 p-2">
        {selectedMembers.length === 0 ? (
          <Text className="py-0.5 text-xs text-muted-foreground">
            참여자를 검색하여 추가해 주세요.
          </Text>
        ) : (
          selectedMembers.map((member) => (
            <Pressable
              accessibilityLabel={`${member.name} 참여자에서 제거`}
              className="flex-row items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 shadow-sm shadow-black/5"
              key={member.id}
              onPress={() =>
                onChange(
                  selectedMembers.filter(
                    (selected) => selected.id !== member.id,
                  ),
                )
              }
            >
              <OrganizationMemberAvatar
                compact
                image={member.image}
                name={member.name}
              />
              <Text className="text-[10px] font-medium">{member.name}</Text>
              <Text className="text-[9px] text-muted-foreground">
                {member.id === currentUserId ? '(본인)' : ''}
              </Text>
              <Icon as={X} className="size-3 text-muted-foreground" />
            </Pressable>
          ))
        )}
      </View>

      <OrganizationMemberSearch
        accessibilityLabel="참여자 검색"
        excludedUserIds={selectedMembers.map((member) => member.id)}
        onSelect={(member) => onChange([...selectedMembers, member.user])}
        organizationId={organizationId}
        placeholder="이름 또는 이메일로 조직 멤버 검색..."
        selectLabel={(name) => `${name} 참여자로 추가`}
      />
    </View>
  );
}
