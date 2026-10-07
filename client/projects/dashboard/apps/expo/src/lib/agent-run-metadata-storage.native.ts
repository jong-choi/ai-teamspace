import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type {
  AgentRunMetadataNamespace,
  AgentRunMetadataStorage,
} from '@core/features/agent-chat/agent-chat-platform';
import { createAgentRunMetadataStorageKey } from '@core/features/agent-chat/lib/agent-run-metadata-key';

const databaseName = 'work-os-agent-runtime.db';
let database: SQLiteDatabase | null = null;

export function createAgentRunMetadataStorage(
  namespace: AgentRunMetadataNamespace,
): AgentRunMetadataStorage {
  return {
    getItem: (key) => {
      const row = getDatabase().getFirstSync<{ value: string }>(
        'SELECT value FROM agent_run_metadata WHERE storage_key = ?',
        createAgentRunMetadataStorageKey(namespace, key),
      );
      return row?.value ?? null;
    },
    setItem: (key, value) => {
      getDatabase().runSync(
        `INSERT INTO agent_run_metadata(storage_key, value)
         VALUES (?, ?)
         ON CONFLICT(storage_key) DO UPDATE SET value = excluded.value`,
        createAgentRunMetadataStorageKey(namespace, key),
        value,
      );
    },
    removeItem: (key) => {
      getDatabase().runSync(
        'DELETE FROM agent_run_metadata WHERE storage_key = ?',
        createAgentRunMetadataStorageKey(namespace, key),
      );
    },
  };
}

function getDatabase(): SQLiteDatabase {
  if (database) return database;

  const opened = openDatabaseSync(databaseName);
  opened.execSync(`
    CREATE TABLE IF NOT EXISTS agent_run_metadata (
      storage_key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  database = opened;
  return opened;
}
