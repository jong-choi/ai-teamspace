export function buildWikiEntryNameCandidate(
  requestedName: string,
  attempt: number,
): string {
  if (attempt === 0) {
    return requestedName;
  }

  const match = /^(.*) \((\d+)\)$/.exec(requestedName);
  const baseName = match?.[1] ?? requestedName;
  const initialSequence = match ? Number.parseInt(match[2], 10) : 0;
  const sequence = initialSequence + attempt;
  return `${baseName} (${String(sequence).padStart(2, '0')})`;
}
