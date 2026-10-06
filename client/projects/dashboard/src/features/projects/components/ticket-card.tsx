import { View } from 'react-native';

import type { TicketSummary } from '@repo/client/api-client/schemas';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { formatTicketDueAt } from '@core/features/projects/lib/ticket-presentation';

import {
  AlertCircle,
  CheckSquare2,
  ChevronDown,
  ChevronUp,
  Clock3,
  MessageSquare,
  Minus,
} from 'lucide-react-native';

const PRIORITY = {
  urgent: {
    label: '긴급',
    icon: AlertCircle,
    containerClass: 'border-red-500/20 bg-red-500/10',
    foregroundClass: 'text-red-600 dark:text-red-400',
  },
  high: {
    label: '높음',
    icon: ChevronUp,
    containerClass: 'border-amber-500/20 bg-amber-500/10',
    foregroundClass: 'text-amber-600 dark:text-amber-400',
  },
  medium: {
    label: '보통',
    icon: Minus,
    containerClass: 'border-blue-500/20 bg-blue-500/10',
    foregroundClass: 'text-blue-600 dark:text-blue-400',
  },
  low: {
    label: '낮음',
    icon: ChevronDown,
    containerClass: 'border-border bg-muted',
    foregroundClass: 'text-muted-foreground',
  },
} as const;

const LABEL_CLASSES = {
  neutral: {
    container: 'bg-zinc-500/10',
    foreground: 'text-zinc-600 dark:text-zinc-300',
  },
  red: {
    container: 'bg-red-500/10',
    foreground: 'text-red-600 dark:text-red-400',
  },
  orange: {
    container: 'bg-orange-500/10',
    foreground: 'text-orange-600 dark:text-orange-400',
  },
  amber: {
    container: 'bg-amber-500/10',
    foreground: 'text-amber-600 dark:text-amber-400',
  },
  green: {
    container: 'bg-emerald-500/10',
    foreground: 'text-emerald-600 dark:text-emerald-400',
  },
  blue: {
    container: 'bg-blue-500/10',
    foreground: 'text-blue-600 dark:text-blue-400',
  },
  violet: {
    container: 'bg-violet-500/10',
    foreground: 'text-violet-600 dark:text-violet-400',
  },
  pink: {
    container: 'bg-pink-500/10',
    foreground: 'text-pink-600 dark:text-pink-400',
  },
} as const;

export function TicketCard({
  dragging = false,
  projectKey,
  ticket,
}: {
  dragging?: boolean;
  projectKey: string;
  ticket: TicketSummary;
}) {
  const priority = PRIORITY[ticket.priority];
  const checklistProgress =
    ticket.checklistItemTotal === 0
      ? 0
      : Math.round(
          (ticket.checklistItemCompleted / ticket.checklistItemTotal) * 100,
        );

  return (
    <View
      className={cn(
        'rounded-xl border border-border bg-card p-3.5 shadow-sm',
        dragging
          ? 'opacity-55'
          : 'web:hover:border-muted-foreground/40 web:hover:shadow-md',
      )}
    >
      <View className="mb-2 flex-row items-center gap-1.5">
        <Text className="font-mono text-[11px] font-bold text-muted-foreground">
          {ticket.key}
        </Text>
        <View
          className={cn(
            'flex-row items-center gap-1 rounded border px-1.5 py-0.5',
            priority.containerClass,
          )}
        >
          <Icon
            as={priority.icon}
            className={cn('size-2.5', priority.foregroundClass)}
          />
          <Text
            className={cn(
              'text-[10px] font-semibold',
              priority.foregroundClass,
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
          const classes = LABEL_CLASSES[label.color];
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
    </View>
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
