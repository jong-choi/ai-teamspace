import type {
  WikiDocument,
  WikiDocumentSummary,
} from '@/wiki/domain/wiki-document';
import type { WikiDocumentCollaborationState } from '@/wiki/domain/wiki-document-collaboration-state';
import type {
  WikiDocumentRevision,
  WikiDocumentRevisionSummary,
} from '@/wiki/domain/wiki-document-revision';
import type { CreateWikiDocumentInput } from '@/wiki/dto/create-wiki-document.dto';
import type { WikiCollaborationSnapshot } from '@/wiki/infrastructure/collaboration/wiki-collaboration-state.provider';

export type WikiTree = WikiDocumentSummary[];

export type DeleteWikiDocumentResult = 'deleted' | 'not_empty' | 'not_found';

export type WikiSearchMatch = {
  documentId: string;
  parentDocumentId: string | null;
  title: string;
  matchedIn: Array<'title' | 'content'>;
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
    organizationId: WikiDocument['organizationId'],
    actorUserId: WikiDocument['createdByUserId'],
    input: CreateWikiDocumentInput,
    collaboration: WikiCollaborationSnapshot,
    collaborationSchemaVersion: WikiDocumentCollaborationState['collaborationSchemaVersion'],
  ): Promise<WikiDocument>;

  abstract updateDocumentMetadata(
    organizationId: WikiDocument['organizationId'],
    documentId: WikiDocument['id'],
    actorUserId: WikiDocument['updatedByUserId'],
    metadata: Pick<WikiDocument, 'parentDocumentId' | 'title' | 'position'>,
  ): Promise<WikiDocument | null>;

  abstract deleteDocument(
    organizationId: string,
    documentId: string,
  ): Promise<DeleteWikiDocumentResult>;

  abstract persistCollaborationSnapshot(
    organizationId: WikiDocument['organizationId'],
    documentId: WikiDocument['id'],
    snapshot: WikiCollaborationSnapshot,
    lastEditorUserId: WikiDocument['updatedByUserId'],
    collaboratorUserIds: readonly WikiDocumentRevision['editorUserId'][],
    collaborationSchemaVersion: WikiDocumentCollaborationState['collaborationSchemaVersion'],
    createCheckpoint: boolean,
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
