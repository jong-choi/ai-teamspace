import type {
  WikiCollaborationLocalDocumentKey,
  WikiCollaborationLocalStore,
} from '@core/features/wiki/collaboration/wiki-collaboration-platform';

import { clearDocument, IndexeddbPersistence, storeState } from 'y-indexeddb';
import * as Y from 'yjs';

const databasePrefix = 'work-os-wiki-collaboration';
const recoveryReadyKey = 'recovery-ready';

export async function createWikiCollaborationLocalStore(
  key: WikiCollaborationLocalDocumentKey,
): Promise<WikiCollaborationLocalStore> {
  const store = new IndexedDbWikiCollaborationLocalStore(
    getWikiCollaborationLocalDatabaseName(key),
  );
  await store.initialize();
  return store;
}

export async function clearWikiCollaborationLocalStore(
  key: WikiCollaborationLocalDocumentKey,
): Promise<void> {
  await clearDocument(getWikiCollaborationLocalDatabaseName(key));
}

class IndexedDbWikiCollaborationLocalStore implements WikiCollaborationLocalStore {
  private document = new Y.Doc();
  private persistence: IndexeddbPersistence;
  private closed = false;
  private recoveryReady = false;

  constructor(private readonly databaseName: string) {
    this.persistence = this.createPersistence(this.document);
  }

  async initialize(): Promise<void> {
    await this.persistence.whenSynced;
    this.recoveryReady = (await this.persistence.get(recoveryReadyKey)) === 1;
  }

  async load(): Promise<readonly Uint8Array[]> {
    this.assertOpen();
    await this.persistence.whenSynced;
    return this.recoveryReady ? [Y.encodeStateAsUpdate(this.document)] : [];
  }

  async append(update: Uint8Array): Promise<void> {
    this.assertOpen();
    Y.applyUpdate(this.document, update, this);
    await storeState(this.persistence, true);
    await this.persistence.set(recoveryReadyKey, 1);
    this.recoveryReady = true;
  }

  async replaceWithSnapshot(snapshot: Uint8Array): Promise<void> {
    this.assertOpen();
    await this.resetDocument(snapshot);
  }

  async clear(): Promise<void> {
    this.assertOpen();
    await this.resetDocument(null);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.recoveryReady) {
      await storeState(this.persistence, true);
    }
    await this.persistence.destroy();
    this.document.destroy();
  }

  private async resetDocument(snapshot: Uint8Array | null): Promise<void> {
    await this.persistence.clearData();
    await this.persistence.destroy();
    this.document.destroy();
    this.document = new Y.Doc();
    if (snapshot) {
      Y.applyUpdate(this.document, snapshot, this);
    }
    this.persistence = this.createPersistence(this.document);
    await this.persistence.whenSynced;
    this.recoveryReady = snapshot !== null;
    if (snapshot) {
      await storeState(this.persistence, true);
      await this.persistence.set(recoveryReadyKey, 1);
    }
  }

  private createPersistence(document: Y.Doc): IndexeddbPersistence {
    return new IndexeddbPersistence(this.databaseName, document);
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('닫힌 위키 공동편집 로컬 저장소를 사용할 수 없습니다.');
    }
  }
}

function getWikiCollaborationLocalDatabaseName(
  key: WikiCollaborationLocalDocumentKey,
): string {
  return `${databasePrefix}:wiki.${key.organizationId}.${key.documentId}`;
}
