import {
  Draggable,
  DropProvider,
  Droppable,
} from 'react-native-reanimated-dnd';

import { createKanbanDndAdapter } from '@core/features/projects/dnd/kanban-dnd-adapter.shared';

const adapter = createKanbanDndAdapter({ Draggable, Droppable, DropProvider });

export const KanbanDndProvider = adapter.KanbanDndProvider;
export const KanbanDraggableTicket = adapter.KanbanDraggableTicket;
export const KanbanDropTarget = adapter.KanbanDropTarget;
