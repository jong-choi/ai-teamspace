import type {
  AgentRunMetadataNamespace,
  AgentRunMetadataStorage,
} from '@core/features/agent-chat/agent-chat-platform';
import { createAgentRunMetadataStorageKey } from '@core/features/agent-chat/lib/agent-run-metadata-key';

export function createAgentRunMetadataStorage(
  namespace: AgentRunMetadataNamespace,
): AgentRunMetadataStorage {
  return {
    getItem: (key) =>
      globalThis.sessionStorage.getItem(
        createAgentRunMetadataStorageKey(namespace, key),
      ),
    setItem: (key, value) => {
      globalThis.sessionStorage.setItem(
        createAgentRunMetadataStorageKey(namespace, key),
        value,
      );
    },
    removeItem: (key) => {
      globalThis.sessionStorage.removeItem(
        createAgentRunMetadataStorageKey(namespace, key),
      );
    },
  };
}
