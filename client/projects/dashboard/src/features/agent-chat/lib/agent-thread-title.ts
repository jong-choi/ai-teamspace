export const agentThreadFallbackTitle = '새 Agent 대화';
const maxTitleLength = 72;

const sensitivePatterns = [
  /\bBearer\s+\S+/iu,
  /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/iu,
  /\bsk-[A-Za-z0-9_-]{16,}\b/u,
  /\b[A-Za-z0-9+/=_-]{40,}\b/u,
];

export function deriveAgentThreadTitle(message: string): string {
  const normalized = message.trim().replace(/\s+/gu, ' ');
  if (
    !normalized ||
    sensitivePatterns.some((pattern) => pattern.test(normalized))
  ) {
    return agentThreadFallbackTitle;
  }

  if (normalized.length <= maxTitleLength) return normalized;
  return `${normalized.slice(0, maxTitleLength - 1).trimEnd()}…`;
}

export function getAgentThreadTitle(metadata: Record<string, unknown>): string {
  const title = metadata['title'];
  return typeof title === 'string' && title.trim()
    ? title.trim()
    : agentThreadFallbackTitle;
}
