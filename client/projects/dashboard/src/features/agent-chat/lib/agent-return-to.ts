const agentThreadPathPattern = /^\/ai\/[A-Za-z0-9_-]+$/;

export function getAgentReturnTo(threadId?: string): string {
  if (!threadId) return '/ai';
  const candidate = '/ai/' + threadId;
  return isAllowedAgentReturnTo(candidate) ? candidate : '/ai';
}

export function parseAgentReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/ai';
  return isAllowedAgentReturnTo(value) ? value : '/ai';
}

export function isAllowedAgentReturnTo(value: string): boolean {
  return value === '/ai' || agentThreadPathPattern.test(value);
}
