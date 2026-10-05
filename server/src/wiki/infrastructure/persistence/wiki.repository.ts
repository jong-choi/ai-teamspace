import type {
  WikiDocument,
  WikiDocumentSummary,
} from '#server/wiki/domain/wiki-document.js';
import type { WikiDocumentCollaborationState } from '#server/wiki/domain/wiki-document-collaboration-state.js';
import type {
  WikiDocumentRevision,
  WikiDocumentRevisionSummary,
} from '#server/wiki/domain/wiki-document-revision.js';

export type WikiTree = WikiDocumentSummary[];

export type CreateWikiDocumentPersistenceInput = {
  organizationId: string;
  parentDocumentId: string | null;
  title: string;
  position: number;
  contentMarkdown: string;
  collaborationState: Uint8Array;
  collaborationSchemaVersion: number;
  actorUserId: string;
};

export type UpdateWikiDocumentMetadataPersistenceInput = {
  organizationId: string;
  documentId: string;
  parentDocumentId: string | null;
  title: string;
  position: number;
  actorUserId: string;
};

export type DeleteWikiDocumentResult = 'deleted' | 'not_empty' | 'not_found';

export type WikiSearchMatch = {
  documentId: string;
  parentDocumentId: string | null;
  title: string;
  matchedIn: Array<'title' | 'content'>;
};

export type PersistWikiCollaborationSnapshotInput = {
  organizationId: string;
  documentId: string;
  encodedState: Uint8Array;
  contentMarkdown: string;
  lastEditorUserId: string;
  collaboratorUserIds: readonly string[];
  schemaVersion: number;
  createCheckpoint: boolean;
};

export type PersistWikiCollaborationSnapshotResult = {
  changed: boolean;
  checkpointCreated: boolean;
  revision: number;
  contentMarkdown: string;
  encodedState: Uint8Array;
};

export abstract class WikiRepository {
  abstract checkCollaborationReady(): Promise<void>;

  abstract getTreeForOrganization(organizationId: string): Promise<WikiTree>;

  abstract findDocumentById(
    organizationId: string,
    documentId: string,
  ): Promise<WikiDocument | null>;

  abstract loadCollaborationState(
    organizationId: string,
    documentId: string,
  ): Promise<WikiDocumentCollaborationState | null>;

  abstract createDocument(
    input: CreateWikiDocumentPersistenceInput,
  ): Promise<WikiDocument>;

  abstract updateDocumentMetadata(
    input: UpdateWikiDocumentMetadataPersistenceInput,
  ): Promise<WikiDocument | null>;

  abstract deleteDocument(
    organizationId: string,
    documentId: string,
  ): Promise<DeleteWikiDocumentResult>;

  abstract persistCollaborationSnapshot(
    input: PersistWikiCollaborationSnapshotInput,
  ): Promise<PersistWikiCollaborationSnapshotResult>;

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
