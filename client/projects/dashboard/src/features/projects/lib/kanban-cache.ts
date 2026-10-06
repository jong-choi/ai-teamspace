import type {
  MoveTicket,
  MoveTicketResult,
  ProjectsControllerListTicketsParams,
  TicketList,
  TicketSummary,
} from '@repo/client/api-client/schemas';

export function applyOptimisticTicketMove(
  current: TicketList,
  ticketId: string,
  move: MoveTicket,
  params: ProjectsControllerListTicketsParams,
): TicketList {
  const moving = current.items.find((ticket) => ticket.id === ticketId);
  if (!moving) return current;

  const remaining = current.items.filter((ticket) => ticket.id !== ticketId);
  if (params.columnId && params.columnId !== move.targetColumnId) {
    return {
      ...current,
      items: normalizeColumnPositions(remaining, moving.columnId),
    };
  }

  const movedTicket: TicketSummary = {
    ...moving,
    columnId: move.targetColumnId,
  };
  const targetTickets = remaining
    .filter((ticket) => ticket.columnId === move.targetColumnId)
    .sort(compareTicketsByPosition);
  const insertionIndex = resolveInsertionIndex(
    targetTickets,
    move.beforeTicketId ?? null,
    move.afterTicketId ?? null,
  );

  const finalTargetTickets = [...targetTickets];
  finalTargetTickets.splice(insertionIndex, 0, movedTicket);
  const targetById = new Map(
    finalTargetTickets.map((ticket, position) => [
      ticket.id,
      { ...ticket, position },
    ]),
  );

  const sourceNormalized =
    moving.columnId === move.targetColumnId
      ? remaining
      : normalizeColumnPositions(remaining, moving.columnId);
  const itemsWithoutTarget = sourceNormalized.filter(
    (ticket) => ticket.columnId !== move.targetColumnId,
  );
  const items = [
    ...itemsWithoutTarget,
    ...finalTargetTickets.map((ticket) => targetById.get(ticket.id) ?? ticket),
  ].sort(compareTicketsByPosition);

  return { ...current, items };
}

export function applyCanonicalTicketMove(
  current: TicketList | undefined,
  result: MoveTicketResult,
): TicketList | undefined {
  if (!current) return current;
  const items = current.items.map((ticket) =>
    ticket.id === result.ticketId
      ? {
          ...ticket,
          columnId: result.columnId,
          position: result.position,
          updatedAt: result.updatedAt,
        }
      : ticket,
  );
  return { ...current, items };
}

function normalizeColumnPositions(
  items: readonly TicketSummary[],
  columnId: string,
): TicketSummary[] {
  const ordered = items
    .filter((ticket) => ticket.columnId === columnId)
    .sort(compareTicketsByPosition);
  const positionById = new Map(
    ordered.map((ticket, position) => [ticket.id, position]),
  );

  return items.map((ticket) => {
    const position = positionById.get(ticket.id);
    return position === undefined ? ticket : { ...ticket, position };
  });
}

function resolveInsertionIndex(
  targetTickets: readonly TicketSummary[],
  beforeTicketId: string | null,
  afterTicketId: string | null,
): number {
  if (beforeTicketId) {
    const index = targetTickets.findIndex(({ id }) => id === beforeTicketId);
    return index >= 0 ? index : targetTickets.length;
  }
  if (afterTicketId) {
    const index = targetTickets.findIndex(({ id }) => id === afterTicketId);
    return index >= 0 ? index + 1 : targetTickets.length;
  }
  return targetTickets.length;
}

function compareTicketsByPosition(left: TicketSummary, right: TicketSummary) {
  return left.position - right.position || left.id.localeCompare(right.id);
}
