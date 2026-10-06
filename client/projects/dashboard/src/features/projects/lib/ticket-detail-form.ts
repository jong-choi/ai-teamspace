export function toTicketDueDateInput(value: string | null): string {
  return value?.slice(0, 10) ?? '';
}

export function parseTicketDueDateInput(
  value: string,
): string | null | undefined {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return undefined;

  const candidate = new Date(`${normalized}T00:00:00.000Z`);
  if (
    Number.isNaN(candidate.getTime()) ||
    candidate.toISOString().slice(0, 10) !== normalized
  ) {
    return undefined;
  }

  return candidate.toISOString();
}
