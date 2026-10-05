export function buildWikiDocumentTitleCandidate(
  requestedTitle: string,
  attempt: number,
): string {
  if (attempt === 0) {
    return requestedTitle;
  }

  const match = /^(.*) \((\d+)\)$/.exec(requestedTitle);
  const baseTitle = match?.[1] ?? requestedTitle;
  const initialSequence = match ? Number.parseInt(match[2], 10) : 0;
  const sequence = initialSequence + attempt;
  return `${baseTitle} (${String(sequence).padStart(2, '0')})`;
}

export function allocateWikiDocumentTitle(
  requestedTitle: string,
  occupiedTitles: ReadonlySet<string>,
): string {
  for (let attempt = 0; ; attempt += 1) {
    const candidate = buildWikiDocumentTitleCandidate(requestedTitle, attempt);
    if (!occupiedTitles.has(candidate)) {
      return candidate;
    }
  }
}
