import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type {
  WikiCollaborationLocalDocumentKey,
  WikiCollaborationLocalStore,
} from '@core/features/wiki/collaboration/wiki-collaboration-platform';

const databaseName = 'teamspace-wiki-collaboration.db';

export async function createWikiCollaborationLocalStore(
  key: WikiCollaborationLocalDocumentKey,
): Promise<WikiCollaborationLocalStore> {
  const database = await openWikiCollaborationDatabase();
  return new SqliteWikiCollaborationLocalStore(
    database,
    getWikiCollaborationDocumentName(key),
  );
}

export async function clearWikiCollaborationLocalStore(
  key: WikiCollaborationLocalDocumentKey,
): Promise<void> {
  const database = await openWikiCollaborationDatabase();
  try {
    await database.runAsync(
      'DELETE FROM wiki_collaboration_update WHERE document_name = ?',
      getWikiCollaborationDocumentName(key),
    );
  } finally {
    await database.closeAsync();
  }
}

class SqliteWikiCollaborationLocalStore implements WikiCollaborationLocalStore {
  private closed = false;

  constructor(
    private readonly database: SQLiteDatabase,
    private readonly documentName: string,
  ) {}

  async load(): Promise<readonly Uint8Array[]> {
    this.assertOpen();
    const rows = await this.database.getAllAsync<{ updateBlob: Uint8Array }>(
      `SELECT update_blob AS updateBlob
       FROM wiki_collaboration_update
       WHERE document_name = ?
       ORDER BY sequence ASC`,
      this.documentName,
    );
    return rows.map(({ updateBlob }) => new Uint8Array(updateBlob));
  }

  async append(update: Uint8Array): Promise<void> {
    this.assertOpen();
    await this.database.runAsync(
      `INSERT INTO wiki_collaboration_update(document_name, update_blob)
       VALUES (?, ?)`,
      this.documentName,
      update,
    );
  }

  async replaceWithSnapshot(snapshot: Uint8Array): Promise<void> {
    this.assertOpen();
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        'DELETE FROM wiki_collaboration_update WHERE document_name = ?',
        this.documentName,
      );
      await transaction.runAsync(
        `INSERT INTO wiki_collaboration_update(document_name, update_blob)
         VALUES (?, ?)`,
        this.documentName,
        snapshot,
      );
    });
  }

  async clear(): Promise<void> {
    this.assertOpen();
    await this.database.runAsync(
      'DELETE FROM wiki_collaboration_update WHERE document_name = ?',
      this.documentName,
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.database.closeAsync();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('닫힌 위키 공동편집 로컬 저장소를 사용할 수 없습니다.');
    }
  }
}

async function openWikiCollaborationDatabase(): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync(databaseName);
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS wiki_collaboration_update (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      document_name TEXT NOT NULL,
      update_blob BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS wiki_collaboration_update_document_sequence_idx
      ON wiki_collaboration_update(document_name, sequence);
  `);
  return database;
}

function getWikiCollaborationDocumentName(
  key: WikiCollaborationLocalDocumentKey,
): string {
  return `wiki.${key.organizationId}.${key.documentId}`;
}
