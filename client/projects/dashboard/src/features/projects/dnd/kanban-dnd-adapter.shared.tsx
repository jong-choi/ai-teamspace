import { type ReactNode, useState } from 'react';
import type {
  Draggable as NativeDraggable,
  Droppable as NativeDroppable,
  DropProvider as NativeDropProvider,
} from 'react-native-reanimated-dnd';

type DndPrimitives = {
  Draggable: typeof NativeDraggable;
  Droppable: typeof NativeDroppable;
  DropProvider: typeof NativeDropProvider;
};

export type KanbanDragData = {
  sourceColumnId: string;
  ticketId: string;
};

export type KanbanDropIntent = {
  afterTicketId: string | null;
  beforeTicketId: string | null;
  targetColumnId: string;
  ticketId: string;
};

export type KanbanDndProviderProps = {
  children: ReactNode;
};

export type KanbanDraggableTicketProps = {
  children: ReactNode;
  data: KanbanDragData;
  disabled?: boolean;
  onDragEnd?: (data: KanbanDragData) => void;
  onDragStart?: (data: KanbanDragData) => void;
};

export type KanbanDropTargetProps = {
  beforeTicketId: string | null;
  children: (active: boolean) => ReactNode;
  disabled?: boolean;
  onDropIntent: (intent: KanbanDropIntent) => void;
  targetColumnId: string;
};

export function createKanbanDndAdapter({
  Draggable,
  Droppable,
  DropProvider,
}: DndPrimitives) {
  function KanbanDndProvider({ children }: KanbanDndProviderProps) {
    return <DropProvider>{children}</DropProvider>;
  }

  function KanbanDraggableTicket({
    children,
    data,
    disabled = false,
    onDragEnd,
    onDragStart,
  }: KanbanDraggableTicketProps) {
    const [dragSession, setDragSession] = useState(0);

    return (
      <Draggable<KanbanDragData>
        data={data}
        draggableId={data.ticketId}
        dragDisabled={disabled}
        key={dragSession}
        onDragEnd={(dragData) => {
          onDragEnd?.(dragData);
          setTimeout(() => setDragSession((current) => current + 1), 0);
        }}
        onDragStart={onDragStart}
        preDragDelay={120}
      >
        {children}
      </Draggable>
    );
  }

  function KanbanDropTarget({
    beforeTicketId,
    children,
    disabled = false,
    onDropIntent,
    targetColumnId,
  }: KanbanDropTargetProps) {
    const [active, setActive] = useState(false);

    return (
      <Droppable<KanbanDragData>
        dropDisabled={disabled}
        droppableId={`${targetColumnId}:${beforeTicketId ?? 'end'}`}
        onActiveChange={setActive}
        onDrop={(data) => {
          setActive(false);
          if (data.ticketId === beforeTicketId) return;
          onDropIntent({
            ticketId: data.ticketId,
            targetColumnId,
            beforeTicketId,
            afterTicketId: null,
          });
        }}
      >
        {children(active)}
      </Droppable>
    );
  }

  return {
    KanbanDndProvider,
    KanbanDraggableTicket,
    KanbanDropTarget,
  };
}
