export function toLikeContainsPattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, '\\$&');
  return `%${escaped}%`;
}
