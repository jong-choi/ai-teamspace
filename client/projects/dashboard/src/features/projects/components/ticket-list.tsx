import { Pressable, ScrollView, View } from 'react-native';

import type {
  ProjectColumn,
  TicketSummary,
} from '@repo/client/api-client/schemas';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { getProjectColumnPresentation } from '@core/features/projects/lib/project-column-presentation';
import { getTicketPriorityPresentation } from '@core/features/projects/lib/ticket-priority-presentation';
import {
  formatTicketDueAt,
  sortTicketsForList,
} from '@core/features/projects/lib/ticket-presentation';

import { Clock3, FolderKanban } from 'lucide-react-native';

export function TicketList({
  columns,
  onOpenTicket,
  projectName,
  tickets,
}: {
  columns: readonly ProjectColumn[];
  onOpenTicket: (ticketId: string) => void;
  projectName: string;
  tickets: readonly TicketSummary[];
}) {
  const columnById = new Map(columns.map((column) => [column.id, column]));
  const orderedTickets = sortTicketsForList(tickets, columns);

  return (
    <ScrollView
      className="min-h-0 flex-1 bg-muted/10"
      contentContainerStyle={{ padding: 24 }}
      nestedScrollEnabled
    >
      <View className="w-full max-w-7xl self-center overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <View className="flex-row items-center justify-between border-b border-border px-3.5 py-3">
          <View className="flex-row items-baseline gap-1">
            <Text className="text-xs text-muted-foreground">총</Text>
            <Text className="font-mono text-xs font-semibold">
              {orderedTickets.length}
            </Text>
            <Text className="text-xs text-muted-foreground">개의 이슈</Text>
          </View>
        </View>

        <ScrollView horizontal nestedScrollEnabled>
          <View className="min-w-[900px] flex-1">
            <View className="flex-row items-center border-b border-border bg-muted/40 px-4 py-2.5">
              <Text className="w-40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                ID / 상태
              </Text>
              <Text className="min-w-72 flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                이슈 제목
              </Text>
              <Text className="hidden w-44 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:flex">
                프로젝트
              </Text>
              <Text className="w-24 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                우선순위
              </Text>
              <Text className="hidden w-36 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:flex">
                담당자
              </Text>
              <Text className="w-28 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                마감일
              </Text>
            </View>

            {orderedTickets.length === 0 ? (
              <View className="items-center py-12">
                <Text className="text-xs text-muted-foreground">
                  일치하는 이슈가 없습니다. 검색어나 필터를 변경해 보세요.
                </Text>
              </View>
            ) : (
              orderedTickets.map((ticket) => {
                const priority = getTicketPriorityPresentation(ticket.priority);
                const column = columnById.get(ticket.columnId);
                const columnPresentation = column
                  ? getProjectColumnPresentation(column.name)
                  : undefined;
                return (
                  <Pressable
                    accessibilityLabel={`${ticket.key} 이슈 상세 열기`}
                    accessibilityRole="button"
                    className="flex-row items-center border-b border-border/70 px-4 py-3 last:border-b-0 web:hover:bg-muted/35"
                    key={ticket.id}
                    onPress={() => onOpenTicket(ticket.id)}
                  >
                    <View className="w-40 flex-row items-center gap-2 pr-3">
                      <Text className="font-mono text-[11px] font-semibold text-muted-foreground">
                        {ticket.key}
                      </Text>
                      <View className="flex-row items-center gap-1 rounded bg-muted px-2 py-0.5">
                        <View
                          className={cn(
                            'size-1.5 rounded-full',
                            columnPresentation?.dotClassName ??
                              'bg-muted-foreground/60',
                          )}
                        />
                        <Text className="max-w-24 truncate text-[10px] font-medium text-muted-foreground">
                          {columnPresentation?.label ?? '알 수 없음'}
                        </Text>
                      </View>
                    </View>

                    <View className="min-w-72 flex-1 flex-row flex-wrap items-center gap-1.5 pr-4">
                      <Text className="mr-1 text-xs font-medium">
                        {ticket.title}
                      </Text>
                      {ticket.labels.map((label) => (
                        <View
                          className="rounded bg-muted px-1.5 py-0.5"
                          key={label.id}
                        >
                          <Text className="text-[9px] text-muted-foreground">
                            {label.name}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <View className="hidden w-44 flex-row items-center gap-1.5 pr-3 md:flex">
                      <Icon
                        as={FolderKanban}
                        className="size-3.5 text-muted-foreground"
                      />
                      <Text className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                        {projectName}
                      </Text>
                    </View>

                    <View className="w-24 flex-row items-center gap-1.5 pr-3">
                      <Icon
                        as={priority.icon}
                        className={cn('size-3', priority.listForegroundClass)}
                      />
                      <Text className="text-[11px] font-medium">
                        {priority.label}
                      </Text>
                    </View>

                    <View className="hidden w-36 flex-row items-center gap-2 pr-3 lg:flex">
                      {ticket.assignee ? (
                        <Avatar
                          alt={`${ticket.assignee.name} 아바타`}
                          className="size-5"
                        >
                          {ticket.assignee.image ? (
                            <AvatarImage
                              source={{ uri: ticket.assignee.image }}
                            />
                          ) : null}
                          <AvatarFallback>
                            <Text className="text-[8px] font-semibold">
                              {ticket.assignee.name.charAt(0)}
                            </Text>
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <View className="size-5 rounded-full bg-muted" />
                      )}
                      <Text className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                        {ticket.assignee?.name ?? '미지정'}
                      </Text>
                    </View>

                    <View className="w-28 flex-row items-center justify-end gap-1">
                      <Icon
                        as={Clock3}
                        className="size-3 text-muted-foreground"
                      />
                      <Text className="text-[10px] text-muted-foreground">
                        {ticket.dueAt ? formatTicketDueAt(ticket.dueAt) : '-'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}
