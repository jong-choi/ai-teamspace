import type { AgentRunMetadataNamespace } from '@core/features/agent-chat/agent-chat-platform';

export function createAgentRunMetadataStorageKey(
  namespace: AgentRunMetadataNamespace,
  key: `lg:stream:${string}`,
): string {
  return [
    'workos-agent',
    encodeURIComponent(namespace.userId),
    encodeURIComponent(namespace.organizationId),
    key,
  ].join(':');
}
