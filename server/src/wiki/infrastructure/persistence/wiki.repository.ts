import type {
  WikiDocument,
  WikiDocumentSummary,
} from '#server/wiki/domain/wiki-document.js';
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

export type UpdateWikiDocumentPersistenceInput = {
  organizationId: string;
  documentId: string;
  folderId: string | null;
  title: string;
  contentMarkdown?: string;
  actorUserId: string;
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

  abstract updateDocument(
    input: UpdateWikiDocumentPersistenceInput,
  ): Promise<WikiDocument | null>;

  abstract deleteDocument(
    organizationId: string,
    documentId: string,
  ): Promise<boolean>;
}
