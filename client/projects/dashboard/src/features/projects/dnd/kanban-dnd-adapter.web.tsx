import { useEffect, useState } from 'react';

import {
  createKanbanDndAdapter,
  type KanbanDndProviderProps,
  type KanbanDraggableTicketProps,
  type KanbanDropTargetProps,
} from '@core/features/projects/dnd/kanban-dnd-adapter.shared';

type KanbanDndAdapter = ReturnType<typeof createKanbanDndAdapter>;

let loadedAdapter: KanbanDndAdapter | null = null;
let adapterPromise: Promise<KanbanDndAdapter> | null = null;

function loadAdapter(): Promise<KanbanDndAdapter> {
  adapterPromise ??= import('@ankhorage/react-native-reanimated-dnd-web').then(
    ({ Draggable, Droppable, DropProvider }) =>
      createKanbanDndAdapter({ Draggable, Droppable, DropProvider }),
  );
  return adapterPromise;
}

function useKanbanDndAdapter(): KanbanDndAdapter | null {
  const [adapter, setAdapter] = useState(loadedAdapter);

  useEffect(() => {
    let active = true;
    void loadAdapter().then((nextAdapter) => {
      loadedAdapter = nextAdapter;
      if (active) setAdapter(nextAdapter);
    });
    return () => {
      active = false;
    };
  }, []);

  return adapter;
}

export function KanbanDndProvider({ children }: KanbanDndProviderProps) {
  const adapter = useKanbanDndAdapter();
  if (!adapter) return children;
  return <adapter.KanbanDndProvider>{children}</adapter.KanbanDndProvider>;
}

export function KanbanDraggableTicket(props: KanbanDraggableTicketProps) {
  const adapter = useKanbanDndAdapter();
  if (!adapter) return props.children;
  return <adapter.KanbanDraggableTicket {...props} />;
}

export function KanbanDropTarget(props: KanbanDropTargetProps) {
  const adapter = useKanbanDndAdapter();
  if (!adapter) return props.children(false);
  return <adapter.KanbanDropTarget {...props} />;
}
