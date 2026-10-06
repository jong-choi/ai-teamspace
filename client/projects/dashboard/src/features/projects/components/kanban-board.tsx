import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type {
  ProjectColumn,
  TicketSummary,
} from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { TicketCard } from '@core/features/projects/components/ticket-card';
import {
  KanbanDndProvider,
  KanbanDraggableTicket,
  KanbanDropTarget,
} from '@core/features/projects/dnd/kanban-dnd-adapter';
import type { KanbanDropIntent } from '@core/features/projects/dnd/kanban-dnd-adapter.shared';
import { getProjectColumnPresentation } from '@core/features/projects/lib/project-column-presentation';

import { GripVertical, Plus } from 'lucide-react-native';

export function KanbanBoard({
  columns,
  disabled = false,
  onCreateTicket,
  onDropIntent,
  projectKey,
  tickets,
}: {
  columns: readonly ProjectColumn[];
  disabled?: boolean;
  onCreateTicket: (columnId: string) => void;
  onDropIntent: (intent: KanbanDropIntent) => void;
  projectKey: string;
  tickets: readonly TicketSummary[];
}) {
  const [draggingTicketId, setDraggingTicketId] = useState<string | null>(null);

  return (
    <KanbanDndProvider>
      <ScrollView
        className="min-h-0 flex-1 bg-muted/10"
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
      >
        <View className="h-full flex-row items-start gap-4">
          {columns.map((column) => {
            const columnTickets = tickets
              .filter((ticket) => ticket.columnId === column.id)
              .sort(
                (left, right) =>
                  left.position - right.position ||
                  left.id.localeCompare(right.id),
              );
            const presentation = getProjectColumnPresentation(column.name);
            return (
              <View
                className="h-full max-h-full w-72 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/35 p-3"
                key={column.id}
              >
                <View className="mb-2 shrink-0 flex-row items-center justify-between border-b border-border/70 pb-2.5">
                  <View className="min-w-0 flex-1 flex-row items-center gap-2">
                    <View
                      className={cn(
                        'size-2 rounded-full',
                        presentation.dotClassName,
                      )}
                    />
                    <Text className="truncate text-xs font-semibold">
                      {presentation.label}
                    </Text>
                    <View className="min-w-5 items-center rounded-full bg-muted px-1.5 py-0.5">
                      <Text className="font-mono text-[10px] text-muted-foreground">
                        {columnTickets.length}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityLabel={`${presentation.label}에 이슈 추가`}
                    className="rounded-md p-1 web:hover:bg-muted"
                    disabled={disabled}
                    onPress={() => onCreateTicket(column.id)}
                  >
                    <Icon
                      as={Plus}
                      className="size-3.5 text-muted-foreground"
                    />
                  </Pressable>
                </View>

                <ScrollView
                  className="min-h-0 flex-1"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  <View className="min-h-40 gap-2.5 p-1">
                    {columnTickets.length === 0 ? (
                      <KanbanDropTarget
                        beforeTicketId={null}
                        disabled={disabled}
                        onDropIntent={onDropIntent}
                        targetColumnId={column.id}
                      >
                        {(active) => (
                          <View
                            className={cn(
                              'min-h-40 items-center justify-center rounded-lg border border-dashed border-border px-4',
                              active && 'border-foreground/40 bg-background',
                            )}
                          >
                            <Text className="text-center text-[11px] text-muted-foreground">
                              {active
                                ? '여기에 놓아 이동'
                                : '이 단계의 이슈가 없습니다'}
                            </Text>
                          </View>
                        )}
                      </KanbanDropTarget>
                    ) : (
                      columnTickets.map((ticket) => (
                        <KanbanDropTarget
                          beforeTicketId={ticket.id}
                          disabled={disabled}
                          key={ticket.id}
                          onDropIntent={onDropIntent}
                          targetColumnId={column.id}
                        >
                          {(active) => (
                            <View
                              className={cn(
                                'rounded-xl',
                                active && 'bg-primary/5 ring-1 ring-primary/30',
                              )}
                            >
                              <KanbanDraggableTicket
                                data={{
                                  ticketId: ticket.id,
                                  sourceColumnId: ticket.columnId,
                                }}
                                disabled={disabled}
                                onDragEnd={() => setDraggingTicketId(null)}
                                onDragStart={({ ticketId }) =>
                                  setDraggingTicketId(ticketId)
                                }
                              >
                                <View className="relative">
                                  <View className="absolute right-2 top-2 z-10 rounded p-0.5 opacity-40">
                                    <Icon
                                      as={GripVertical}
                                      className="size-3 text-muted-foreground"
                                    />
                                  </View>
                                  <TicketCard
                                    dragging={draggingTicketId === ticket.id}
                                    projectKey={projectKey}
                                    ticket={ticket}
                                  />
                                </View>
                              </KanbanDraggableTicket>
                            </View>
                          )}
                        </KanbanDropTarget>
                      ))
                    )}

                    {columnTickets.length > 0 ? (
                      <KanbanDropTarget
                        beforeTicketId={null}
                        disabled={disabled}
                        onDropIntent={onDropIntent}
                        targetColumnId={column.id}
                      >
                        {(active) => (
                          <View
                            className={cn(
                              'h-8 items-center justify-center rounded-md border border-dashed border-transparent',
                              active && 'border-primary/40 bg-primary/5',
                            )}
                          >
                            <Text
                              className={cn(
                                'text-[9px] text-transparent',
                                active && 'text-muted-foreground',
                              )}
                            >
                              컬럼 끝으로 이동
                            </Text>
                          </View>
                        )}
                      </KanbanDropTarget>
                    ) : null}
                  </View>
                </ScrollView>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </KanbanDndProvider>
  );
}
