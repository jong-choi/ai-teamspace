import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type {
  OrganizationMember,
  ProjectColumn,
} from '@repo/client/api-client/schemas';
import { CreateTicket } from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import { cn } from '@repo/client/rnr/lib/utils';
import { DIALOG_WIDTH } from '@core/app/ui/dialog-width';
import { TicketDescriptionInput } from '@core/features/projects/components/ticket-description-input';
import { getProjectColumnPresentation } from '@core/features/projects/lib/project-column-presentation';
import {
  TICKET_PRIORITY_OPTIONS,
  type TicketPriority,
} from '@core/features/projects/lib/ticket-priority-presentation';
import { useCreateTicketMutation } from '@core/features/projects/projects-mutations';

const NO_ASSIGNEE = '__none__';

export function CreateTicketDialog({
  columns,
  initialColumnId,
  members,
  onOpenChange,
  open,
  organizationId,
  projectId,
}: {
  columns: readonly ProjectColumn[];
  initialColumnId?: string;
  members: readonly OrganizationMember[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  projectId: string;
}) {
  const mutation = useCreateTicketMutation(organizationId, projectId);
  const [title, setTitle] = useState('');
  const [descriptionMarkdown, setDescriptionMarkdown] = useState('');
  const [columnId, setColumnId] = useState(
    initialColumnId ?? columns[0]?.id ?? '',
  );
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [assigneeUserId, setAssigneeUserId] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );
  const selectedColumn = columns.find((column) => column.id === columnId);
  const selectedColumnPresentation = selectedColumn
    ? getProjectColumnPresentation(selectedColumn.name)
    : undefined;
  const assignee = members.find(({ userId }) => userId === assigneeUserId);
  const selectedPriority = TICKET_PRIORITY_OPTIONS.find(
    (item) => item.value === priority,
  );

  const reset = () => {
    setTitle('');
    setDescriptionMarkdown('');
    setColumnId(initialColumnId ?? columns[0]?.id ?? '');
    setPriority('medium');
    setAssigneeUserId(null);
    setValidationMessage(null);
  };
  const close = () => {
    if (mutation.isPending) return;
    reset();
    onOpenChange(false);
  };
  const submit = () => {
    const result = CreateTicket.safeParse({
      columnId,
      title: title.trim(),
      descriptionMarkdown,
      priority,
      assigneeUserId,
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
      <DialogContent className={cn('gap-0 rounded-xl p-0', DIALOG_WIDTH.lg)}>
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6 pr-12">
          <DialogTitle className="text-base">새 이슈</DialogTitle>
        </DialogHeader>

        <View className="gap-4 px-6 py-5">
          <View className="gap-1.5">
            <Text className="text-xs font-medium">제목</Text>
            <Input
              accessibilityLabel="이슈 제목"
              className="h-9 text-xs"
              editable={!mutation.isPending}
              onChangeText={setTitle}
              placeholder="구체적인 작업 제목"
              value={title}
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-xs font-medium">설명</Text>
            <TicketDescriptionInput
              disabled={mutation.isPending}
              onChangeText={setDescriptionMarkdown}
              value={descriptionMarkdown}
            />
          </View>

          <View className="flex-row gap-3">
            <View className="min-w-0 flex-1 gap-1.5">
              <Text className="text-xs font-medium">상태</Text>
              <Select
                disabled={mutation.isPending}
                onValueChange={(option) =>
                  option?.value && setColumnId(option.value)
                }
                value={
                  selectedColumn && selectedColumnPresentation
                    ? {
                        label: selectedColumnPresentation.label,
                        value: selectedColumn.id,
                      }
                    : undefined
                }
              >
                <SelectTrigger
                  accessibilityLabel="이슈 상태 선택"
                  className="h-9"
                >
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent align="start" side="bottom">
                  {columns.map((column) => {
                    const presentation = getProjectColumnPresentation(
                      column.name,
                    );
                    return (
                      <SelectItem
                        key={column.id}
                        label={presentation.label}
                        value={column.id}
                      >
                        {presentation.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </View>

            <View className="min-w-0 flex-1 gap-1.5">
              <Text className="text-xs font-medium">우선순위</Text>
              <Select
                disabled={mutation.isPending}
                onValueChange={(option) => {
                  const next = TICKET_PRIORITY_OPTIONS.find(
                    ({ value }) => value === option?.value,
                  );
                  if (next) setPriority(next.value);
                }}
                value={selectedPriority}
              >
                <SelectTrigger
                  accessibilityLabel="이슈 우선순위 선택"
                  className="h-9"
                >
                  <SelectValue placeholder="우선순위" />
                </SelectTrigger>
                <SelectContent align="start" side="bottom">
                  {TICKET_PRIORITY_OPTIONS.map((item) => (
                    <SelectItem
                      key={item.value}
                      label={item.label}
                      value={item.value}
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </View>
          </View>

          <View className="gap-1.5">
            <Text className="text-xs font-medium">담당자</Text>
            <Select
              disabled={mutation.isPending}
              onValueChange={(option) =>
                setAssigneeUserId(
                  option?.value && option.value !== NO_ASSIGNEE
                    ? option.value
                    : null,
                )
              }
              value={
                assignee
                  ? { label: assignee.user.name, value: assignee.userId }
                  : { label: '담당자 미지정', value: NO_ASSIGNEE }
              }
            >
              <SelectTrigger
                accessibilityLabel="이슈 담당자 선택"
                className="h-9"
              >
                <SelectValue placeholder="담당자 선택" />
              </SelectTrigger>
              <SelectContent align="start" side="bottom">
                <SelectItem label="담당자 미지정" value={NO_ASSIGNEE}>
                  담당자 미지정
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
            <Text className="text-xs text-destructive">
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
            disabled={mutation.isPending || !columnId || !title.trim()}
            onPress={submit}
            size="sm"
          >
            {mutation.isPending ? <ActivityIndicator size="small" /> : null}
            <Text className="text-xs text-primary-foreground">
              {mutation.isPending ? '생성 중' : '이슈 만들기'}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
