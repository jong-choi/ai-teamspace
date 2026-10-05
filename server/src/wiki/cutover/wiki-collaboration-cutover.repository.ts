export type LegacyWikiEntry = {
  id: string;
  organizationId: string;
  parentFolderId: string | null;
  kind: 'folder' | 'document';
  name: string;
  position: number;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type LegacyWikiDocument = {
  id: string;
  collectionId: string | null;
  organizationId: string | null;
  parentDocumentId: string | null;
  title: string | null;
  position: number | null;
  contentMarkdown: string;
  collaborationState: Uint8Array | null;
  collaborationSchemaVersion: number | null;
  revision: number;
  createdByUserId: string | null;
  updatedByUserId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type WikiCutoverSnapshot = {
  entries: LegacyWikiEntry[];
  documents: LegacyWikiDocument[];
  revisions: WikiCutoverFinalRevision[];
};

export type WikiCutoverDocumentInput = {
  entry: LegacyWikiEntry;
  contentMarkdown: string;
  revision: number;
  updatedByUserId: string;
  collaborationState: Uint8Array;
  collaborationSchemaVersion: number;
};

export type WikiCutoverFinalDocument = {
  id: string;
  collectionId: string | null;
  organizationId: string | null;
  parentDocumentId: string | null;
  title: string | null;
  position: number | null;
  contentMarkdown: string;
  collaborationState: Uint8Array | null;
  collaborationSchemaVersion: number | null;
  revision: number;
  createdByUserId: string | null;
  updatedByUserId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type WikiCutoverFinalRevision = {
  documentId: string;
  organizationId: string;
  revision: number;
  editorUserId: string;
  contentMarkdown: string;
};

export type WikiCutoverFinalRevisionCollaborator = {
  documentId: string;
  revision: number;
  userId: string;
  ordinal: number;
};

export type WikiCutoverFinalSnapshot = {
  collectionOrganizationIds: string[];
  documents: WikiCutoverFinalDocument[];
  revisions: WikiCutoverFinalRevision[];
  revisionCollaborators: WikiCutoverFinalRevisionCollaborator[];
};

export abstract class WikiCollaborationCutoverRepository {
  abstract loadSnapshot(): Promise<WikiCutoverSnapshot>;

  abstract convertOrganization(
    organizationId: string,
    documents: readonly WikiCutoverDocumentInput[],
  ): Promise<void>;

  abstract loadFinalSnapshot(): Promise<WikiCutoverFinalSnapshot>;
}
