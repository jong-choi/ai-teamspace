import type {
  ProjectColumn,
  TicketSummary,
} from '@repo/client/api-client/schemas';

export function formatTicketDueAt(value: string): string {
  return value.slice(0, 10).replaceAll('-', '.');
}

export function sortTicketsForList(
  tickets: readonly TicketSummary[],
  columns: readonly ProjectColumn[],
): TicketSummary[] {
  const columnPosition = new Map(
    columns.map((column) => [column.id, column.position]),
  );

  return [...tickets].sort((left, right) => {
    const columnDelta =
      (columnPosition.get(left.columnId) ?? Number.MAX_SAFE_INTEGER) -
      (columnPosition.get(right.columnId) ?? Number.MAX_SAFE_INTEGER);
    return (
      columnDelta ||
      left.position - right.position ||
      left.id.localeCompare(right.id)
    );
  });
}
