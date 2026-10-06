import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { OrganizationMember } from '@repo/client/api-client/schemas';
import { CreateProject } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Input } from '@repo/client/rnr/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useCreateProjectMutation } from '@core/features/projects/projects-mutations';

const NO_LEAD = '__none__';

export function CreateProjectDialog({
  members,
  onOpenChange,
  open,
  organizationId,
}: {
  members: readonly OrganizationMember[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
}) {
  const mutation = useCreateProjectMutation(organizationId);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leadUserId, setLeadUserId] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );
  const lead = members.find(({ userId }) => userId === leadUserId);
  const leadValue = useMemo(
    () =>
      lead
        ? { label: lead.user.name, value: lead.userId }
        : { label: '리드 미지정', value: NO_LEAD },
    [lead],
  );

  const reset = () => {
    setKey('');
    setName('');
    setDescription('');
    setLeadUserId(null);
    setValidationMessage(null);
  };
  const close = () => {
    if (mutation.isPending) return;
    reset();
    onOpenChange(false);
  };
  const submit = () => {
    const result = CreateProject.safeParse({
      key: key.trim(),
      name: name.trim(),
      description: description.trim(),
      leadUserId,
    });
    if (!result.success) {
      setValidationMessage(
        result.error.issues[0]?.message ?? '입력값을 확인해 주세요.',
      );
      return;
    }
    setValidationMessage(null);
    mutation.create(result.data, () => {
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
      <DialogContent className="gap-0 rounded-xl p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6 pr-12">
          <DialogTitle className="text-base">새 프로젝트</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            Project가 하나의 Kanban 작업공간을 소유합니다. 키는 생성 후 이슈
            번호에 사용됩니다.
          </DialogDescription>
        </DialogHeader>

        <View className="gap-4 px-6 py-5">
          <View className="flex-row gap-3">
            <View className="w-28 gap-1.5">
              <Text className="text-xs font-medium">프로젝트 키</Text>
              <Input
                accessibilityLabel="프로젝트 키"
                autoCapitalize="characters"
                className="h-9 font-mono text-xs"
                editable={!mutation.isPending}
                maxLength={12}
                onChangeText={(value) =>
                  setKey(value.toUpperCase().replace(/\s+/g, ''))
                }
                placeholder="OS"
                value={key}
              />
            </View>
            <View className="min-w-0 flex-1 gap-1.5">
              <Text className="text-xs font-medium">이름</Text>
              <Input
                accessibilityLabel="프로젝트 이름"
                className="h-9 text-xs"
                editable={!mutation.isPending}
                onChangeText={setName}
                placeholder="운영 시스템"
                value={name}
              />
            </View>
          </View>

          <View className="gap-1.5">
            <Text className="text-xs font-medium">설명</Text>
            <Input
              accessibilityLabel="프로젝트 설명"
              className="min-h-20 py-2 text-xs"
              editable={!mutation.isPending}
              multiline
              onChangeText={setDescription}
              placeholder="프로젝트의 목표와 범위를 입력하세요."
              textAlignVertical="top"
              value={description}
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-xs font-medium">프로젝트 리드</Text>
            <Select
              disabled={mutation.isPending}
              onValueChange={(option) =>
                setLeadUserId(
                  option?.value && option.value !== NO_LEAD
                    ? option.value
                    : null,
                )
              }
              value={leadValue}
            >
              <SelectTrigger
                accessibilityLabel="프로젝트 리드 선택"
                className="h-9"
              >
                <SelectValue placeholder="리드 선택" />
              </SelectTrigger>
              <SelectContent align="start" side="bottom">
                <SelectItem label="리드 미지정" value={NO_LEAD}>
                  리드 미지정
                </SelectItem>
                {members.map((member) => (
                  <SelectItem
                    key={member.userId}
                    label={member.user.name}
                    value={member.userId}
                  >
                    {member.user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </View>

          {validationMessage ? (
            <Text className="text-[11px] text-destructive">
              {validationMessage}
            </Text>
          ) : null}
        </View>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button
            disabled={mutation.isPending}
            onPress={close}
            size="sm"
            variant="outline"
          >
            <Text className="text-xs">취소</Text>
          </Button>
          <Button
            disabled={mutation.isPending || !key || !name.trim()}
            onPress={submit}
            size="sm"
          >
            {mutation.isPending ? <ActivityIndicator size="small" /> : null}
            <Text className="text-xs text-primary-foreground">
              {mutation.isPending ? '생성 중' : '프로젝트 만들기'}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
