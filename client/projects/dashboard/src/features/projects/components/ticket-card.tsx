import { Pressable, View } from 'react-native';

import type { TicketSummary } from '@repo/client/api-client/schemas';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { getTicketLabelClasses } from '@core/features/projects/lib/ticket-label-presentation';
import { formatTicketDueAt } from '@core/features/projects/lib/ticket-presentation';
import { getTicketPriorityPresentation } from '@core/features/projects/lib/ticket-priority-presentation';

import { CheckSquare2, Clock3, MessageSquare } from 'lucide-react-native';

export function TicketCard({
  dragging = false,
  onPress,
  projectKey,
  ticket,
}: {
  dragging?: boolean;
  onPress?: () => void;
  projectKey: string;
  ticket: TicketSummary;
}) {
  const priority = getTicketPriorityPresentation(ticket.priority);
  const checklistProgress =
    ticket.checklistItemTotal === 0
      ? 0
      : Math.round(
          (ticket.checklistItemCompleted / ticket.checklistItemTotal) * 100,
        );

  return (
    <Pressable
      accessibilityLabel={`${ticket.key} 이슈 상세 열기`}
      accessibilityRole="button"
      className={cn(
        'rounded-xl border border-border bg-card p-3.5 shadow-sm',
        dragging
          ? 'opacity-55'
          : 'web:hover:border-muted-foreground/40 web:hover:shadow-md',
      )}
      disabled={!onPress || dragging}
      onPress={onPress}
    >
      <View className="mb-2 flex-row items-center gap-1.5">
        <Text className="font-mono text-[11px] font-bold text-muted-foreground">
          {ticket.key}
        </Text>
        <View
          className={cn(
            'flex-row items-center gap-1 rounded border px-1.5 py-0.5',
            priority.badgeContainerClass,
          )}
        >
          <Icon
            as={priority.icon}
            className={cn('size-2.5', priority.badgeForegroundClass)}
          />
          <Text
            className={cn(
              'text-[10px] font-semibold',
              priority.badgeForegroundClass,
            )}
          >
            {priority.label}
          </Text>
        </View>
      </View>

      <Text
        className="mb-2.5 text-xs font-semibold leading-5"
        numberOfLines={2}
      >
        {ticket.title}
      </Text>

      <View className="mb-2.5 flex-row flex-wrap items-center gap-1">
        <View className="rounded bg-muted px-1.5 py-0.5">
          <Text className="font-mono text-[10px] text-muted-foreground">
            {projectKey}
          </Text>
        </View>
        {ticket.labels.map((label) => {
          const classes = getTicketLabelClasses(label.color);
          return (
            <View
              className={cn('rounded px-1.5 py-0.5', classes.container)}
              key={label.id}
            >
              <Text
                className={cn('text-[10px] font-medium', classes.foreground)}
              >
                {label.name}
              </Text>
            </View>
          );
        })}
      </View>

      {ticket.checklistItemTotal > 0 ? (
        <View className="mb-2.5 flex-row items-center justify-between">
          <View className="flex-row items-center gap-1">
            <Icon as={CheckSquare2} className="size-3 text-muted-foreground" />
            <Text className="text-[10px] text-muted-foreground">
              {ticket.checklistItemCompleted}/{ticket.checklistItemTotal}
            </Text>
          </View>
          <View className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <View
              className="h-full rounded-full bg-foreground"
              style={{ width: `${checklistProgress}%` }}
            />
          </View>
        </View>
      ) : null}

      <View className="mt-2 flex-row items-center justify-between border-t border-border/60 pt-2.5">
        <View className="flex-row items-center gap-1">
          <Icon as={Clock3} className="size-3 text-muted-foreground" />
          <Text className="text-[10px] text-muted-foreground">
            {ticket.dueAt ? formatTicketDueAt(ticket.dueAt) : '마감일 없음'}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {ticket.commentCount > 0 ? (
            <View className="flex-row items-center gap-0.5">
              <Icon
                as={MessageSquare}
                className="size-3 text-muted-foreground"
              />
              <Text className="text-[10px] text-muted-foreground">
                {ticket.commentCount}
              </Text>
            </View>
          ) : null}
          {ticket.assignee ? (
            <Avatar alt={`${ticket.assignee.name} 아바타`} className="size-5">
              {ticket.assignee.image ? (
                <AvatarImage source={{ uri: ticket.assignee.image }} />
              ) : null}
              <AvatarFallback>
                <Text className="text-[8px] font-bold">
                  {getInitials(ticket.assignee.name)}
                </Text>
              </AvatarFallback>
            </Avatar>
          ) : (
            <View className="size-5 items-center justify-center rounded-full bg-muted">
              <Text className="text-[8px] font-bold text-muted-foreground">
                -
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}
