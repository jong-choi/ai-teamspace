import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import type {
  MoveTicket,
  OrganizationMember,
  ProjectColumn,
  TicketDetail,
  TicketLabel,
  UpdateTicket,
} from '@repo/client/api-client/schemas';
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
import { getProjectColumnPresentation } from '@core/features/projects/lib/project-column-presentation';
import {
  parseTicketDueDateInput,
  toTicketDueDateInput,
} from '@core/features/projects/lib/ticket-detail-form';
import { getTicketLabelClasses } from '@core/features/projects/lib/ticket-label-presentation';
import { TICKET_PRIORITY_OPTIONS } from '@core/features/projects/lib/ticket-priority-presentation';

const NO_ASSIGNEE = '__none__';

export function TicketMetadataPanel({
  allLabels,
  columns,
  detail,
  fieldDisabled,
  labelDisabled,
  members,
  onAttachLabel,
  onDetachLabel,
  onMoveTicket,
  onUpdateTicket,
}: {
  allLabels: readonly TicketLabel[];
  columns: readonly ProjectColumn[];
  detail: TicketDetail;
  fieldDisabled: boolean;
  labelDisabled: boolean;
  members: readonly OrganizationMember[];
  onAttachLabel: (labelId: string) => void;
  onDetachLabel: (labelId: string) => void;
  onMoveTicket: (input: MoveTicket) => void;
  onUpdateTicket: (
    input: UpdateTicket,
    callbacks?: { onError?: () => void; onSuccess?: () => void },
  ) => void;
}) {
  const currentColumn = columns.find(({ id }) => id === detail.columnId);
  const columnPresentation = currentColumn
    ? getProjectColumnPresentation(currentColumn.name)
    : undefined;
  const assignee = members.find(
    ({ userId }) => userId === detail.assignee?.userId,
  );
  const assigneeValue = assignee
    ? { label: assignee.user.name, value: assignee.userId }
    : detail.assignee
      ? { label: detail.assignee.name, value: detail.assignee.userId }
      : { label: '미지정', value: NO_ASSIGNEE };
  const priority = TICKET_PRIORITY_OPTIONS.find(
    ({ value }) => value === detail.priority,
  );
  const [dueDateDraft, setDueDateDraft] = useState(
    toTicketDueDateInput(detail.dueAt),
  );
  const [dueDateError, setDueDateError] = useState<string | null>(null);

  useEffect(() => {
    setDueDateDraft(toTicketDueDateInput(detail.dueAt));
    setDueDateError(null);
  }, [detail.dueAt]);

  const attachedLabelIds = new Set(detail.labels.map(({ id }) => id));

  return (
    <View className="h-fit gap-4 rounded-xl border border-border/80 bg-muted/30 p-4 md:w-48 md:shrink-0">
      <MetadataField label="상태">
        <Select
          disabled={fieldDisabled}
          onValueChange={(option) => {
            if (!option?.value || option.value === detail.columnId) return;
            onMoveTicket({ targetColumnId: option.value });
          }}
          value={
            currentColumn && columnPresentation
              ? { label: columnPresentation.label, value: currentColumn.id }
              : undefined
          }
        >
          <SelectTrigger accessibilityLabel="상태 변경" className="h-8">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent align="start" side="bottom">
            {columns.map((column) => {
              const presentation = getProjectColumnPresentation(column.name);
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
      </MetadataField>

      <MetadataField label="우선순위">
        <Select
          disabled={fieldDisabled}
          onValueChange={(option) => {
            const next = TICKET_PRIORITY_OPTIONS.find(
              ({ value }) => value === option?.value,
            );
            if (next && next.value !== detail.priority) {
              onUpdateTicket({ priority: next.value });
            }
          }}
          value={priority}
        >
          <SelectTrigger accessibilityLabel="우선순위 변경" className="h-8">
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
      </MetadataField>

      <View className="gap-3 border-t border-border/80 pt-3">
        <MetadataField label="담당자">
          <Select
            disabled={fieldDisabled}
            onValueChange={(option) => {
              const nextUserId =
                option?.value && option.value !== NO_ASSIGNEE
                  ? option.value
                  : null;
              if (nextUserId !== (detail.assignee?.userId ?? null)) {
                onUpdateTicket({ assigneeUserId: nextUserId });
              }
            }}
            value={assigneeValue}
          >
            <SelectTrigger accessibilityLabel="담당자 변경" className="h-8">
              <SelectValue placeholder="담당자" />
            </SelectTrigger>
            <SelectContent align="start" side="bottom">
              <SelectItem label="미지정" value={NO_ASSIGNEE}>
                미지정
              </SelectItem>
              {members.map((member) => (
                <SelectItem
                  key={member.userId}
                  label={`${member.user.name} · ${member.user.email}`}
                  value={member.userId}
                >
                  {member.user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </MetadataField>

        <MetadataField label="보고자">
          <Text className="text-xs font-medium">{detail.reporter.name}</Text>
          <Text className="text-2xs text-muted-foreground" numberOfLines={1}>
            {detail.reporter.email}
          </Text>
        </MetadataField>

        <MetadataField label="마감일">
          <Input
            accessibilityLabel="마감일 변경"
            className="h-8 font-mono text-xs"
            editable={!fieldDisabled}
            onBlur={() => {
              const nextDueAt = parseTicketDueDateInput(dueDateDraft);
              if (nextDueAt === undefined) {
                setDueDateError('YYYY-MM-DD 형식의 실제 날짜를 입력하세요.');
                return;
              }
              setDueDateError(null);
              if (
                toTicketDueDateInput(nextDueAt) !==
                toTicketDueDateInput(detail.dueAt)
              ) {
                onUpdateTicket(
                  { dueAt: nextDueAt },
                  {
                    onError: () =>
                      setDueDateDraft(toTicketDueDateInput(detail.dueAt)),
                  },
                );
              }
            }}
            onChangeText={(value) => {
              setDueDateDraft(value);
              setDueDateError(null);
            }}
            placeholder="YYYY-MM-DD"
            value={dueDateDraft}
          />
          {dueDateError ? (
            <Text className="text-2xs leading-4 text-destructive">
              {dueDateError}
            </Text>
          ) : null}
        </MetadataField>
      </View>

      <View className="gap-2 border-t border-border/80 pt-3">
        <Text className="text-xs font-medium text-muted-foreground">라벨</Text>
        {allLabels.length === 0 ? (
          <Text className="text-2xs leading-4 text-muted-foreground">
            이 Project에 등록된 라벨이 없습니다.
          </Text>
        ) : (
          <View className="flex-row flex-wrap gap-1.5">
            {allLabels.map((label) => {
              const selected = attachedLabelIds.has(label.id);
              const classes = getTicketLabelClasses(label.color);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: labelDisabled }}
                  className={cn(
                    'rounded border px-2 py-1',
                    classes.container,
                    selected
                      ? 'border-foreground/30'
                      : 'border-transparent opacity-55',
                  )}
                  disabled={labelDisabled}
                  key={label.id}
                  onPress={() =>
                    selected ? onDetachLabel(label.id) : onAttachLabel(label.id)
                  }
                >
                  <Text
                    className={cn('text-2xs font-medium', classes.foreground)}
                  >
                    {label.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

function MetadataField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}
