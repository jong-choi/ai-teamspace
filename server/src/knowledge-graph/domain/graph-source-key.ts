export function graphSourceKey(
  kind: string,
  organizationId: string,
  id: string,
): string {
  return JSON.stringify([kind, organizationId, id]);
}
