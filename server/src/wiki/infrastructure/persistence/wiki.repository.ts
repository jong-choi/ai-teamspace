import type {
  WikiDocument,
  WikiDocumentSummary,
} from '#server/wiki/domain/wiki-document.js';
import type {
  WikiDocumentRevision,
  WikiDocumentRevisionSummary,
} from '#server/wiki/domain/wiki-document-revision.js';
import type { WikiEditLock } from '#server/wiki/domain/wiki-edit-lock.js';
import type { WikiFolder } from '#server/wiki/domain/wiki-folder.js';

export type WikiTree = {
  folders: WikiFolder[];
  documents: WikiDocumentSummary[];
};

export type CreateWikiFolderPersistenceInput = {
  organizationId: string;
  parentFolderId: string | null;
  name: string;
  position: number;
  createdByUserId: string;
};

export type UpdateWikiFolderPersistenceInput = {
  organizationId: string;
  folderId: string;
  parentFolderId: string | null;
  name: string;
  position: number;
};

export type CreateWikiDocumentPersistenceInput = {
  organizationId: string;
  folderId: string | null;
  title: string;
  contentMarkdown: string;
  actorUserId: string;
};

export type UpdateWikiDocumentMetadataPersistenceInput = {
  organizationId: string;
  documentId: string;
  folderId: string | null;
  title: string;
  actorUserId: string;
};

export type WikiEditLockPersistenceInput = {
  organizationId: string;
  documentId: string;
  actorUserId: string;
};

export type SaveWikiDocumentContentPersistenceInput = {
  organizationId: string;
  documentId: string;
  contentMarkdown: string;
  baseRevision: number;
  actorUserId: string;
};

export type SaveWikiDocumentContentPersistenceResult =
  | { status: 'saved'; document: WikiDocument }
  | {
      status: 'conflict_copy_created';
      document: WikiDocument;
      conflictCopy: WikiDocument;
    }
  | { status: 'locked_by_other' }
  | { status: 'lock_required' }
  | { status: 'not_found' };

export type WikiSearchMatch = {
  kind: 'folder' | 'document';
  id: string;
  parentFolderId: string | null;
  name: string;
  matchedIn: Array<'name' | 'content'>;
};

export type DeleteWikiFolderResult = 'deleted' | 'not_empty' | 'not_found';

export abstract class WikiRepository {
  abstract getTreeForOrganization(organizationId: string): Promise<WikiTree>;

  abstract findFolderById(
    organizationId: string,
    folderId: string,
  ): Promise<WikiFolder | null>;

  abstract createFolder(
    input: CreateWikiFolderPersistenceInput,
  ): Promise<WikiFolder>;

  abstract updateFolder(
    input: UpdateWikiFolderPersistenceInput,
  ): Promise<WikiFolder | null>;

  abstract deleteFolder(
    organizationId: string,
    folderId: string,
  ): Promise<DeleteWikiFolderResult>;

  abstract findDocumentById(
    organizationId: string,
    documentId: string,
  ): Promise<WikiDocument | null>;

  abstract createDocument(
    input: CreateWikiDocumentPersistenceInput,
  ): Promise<WikiDocument>;

  abstract updateDocumentMetadata(
    input: UpdateWikiDocumentMetadataPersistenceInput,
  ): Promise<WikiDocument | null>;

  abstract deleteDocument(
    organizationId: string,
    documentId: string,
  ): Promise<boolean>;

  abstract acquireEditLock(
    input: WikiEditLockPersistenceInput,
  ): Promise<WikiEditLock | null>;

  abstract renewEditLock(
    input: WikiEditLockPersistenceInput,
  ): Promise<WikiEditLock | null>;

  abstract releaseEditLock(
    input: WikiEditLockPersistenceInput,
  ): Promise<WikiEditLock | null>;

  abstract saveDocumentContent(
    input: SaveWikiDocumentContentPersistenceInput,
  ): Promise<SaveWikiDocumentContentPersistenceResult>;

  abstract listDocumentRevisions(
    organizationId: string,
    documentId: string,
  ): Promise<WikiDocumentRevisionSummary[]>;

  abstract findDocumentRevision(
    organizationId: string,
    documentId: string,
    revision: number,
  ): Promise<WikiDocumentRevision | null>;

  abstract search(
    organizationId: string,
    query: string,
  ): Promise<WikiSearchMatch[]>;
}
