export function safeAgentIntegrationExternalText(
  value: string,
  maximumLength: number,
): string {
  let sanitized = '';

  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      sanitized += ' ';
      continue;
    }
    if (
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) {
      continue;
    }
    sanitized += character;
    if (sanitized.length >= maximumLength) {
      return sanitized.slice(0, maximumLength);
    }
  }

  return sanitized.slice(0, maximumLength);
}
