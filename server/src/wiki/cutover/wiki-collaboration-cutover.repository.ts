import type {
  cutoverWikiDocument,
  legacyWikiEntry,
} from '@/wiki/cutover/infrastructure/drizzle/legacy-wiki-tables';
import type { wikiDocumentRevision } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.schema';
import type { wikiDocumentRevisionCollaborator } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision-collaborator.schema';

export type LegacyWikiEntry = typeof legacyWikiEntry.$inferSelect;
export type LegacyWikiDocument = Omit<
  typeof cutoverWikiDocument.$inferSelect,
  'collaborationPersistedAt'
>;

export type WikiCutoverSnapshot = {
  entries: LegacyWikiEntry[];
  documents: LegacyWikiDocument[];
  revisions: WikiCutoverFinalRevision[];
};

export type WikiCutoverDocumentInput = Pick<
  LegacyWikiDocument,
  'contentMarkdown' | 'revision' | 'updatedByUserId'
> & {
  entry: LegacyWikiEntry;
  collaborationState: NonNullable<LegacyWikiDocument['collaborationState']>;
  collaborationSchemaVersion: NonNullable<
    LegacyWikiDocument['collaborationSchemaVersion']
  >;
};

export type WikiCutoverFinalDocument = LegacyWikiDocument;
export type WikiCutoverFinalRevision = Pick<
  typeof wikiDocumentRevision.$inferSelect,
  | 'documentId'
  | 'organizationId'
  | 'revision'
  | 'editorUserId'
  | 'contentMarkdown'
>;
export type WikiCutoverFinalRevisionCollaborator = Pick<
  typeof wikiDocumentRevisionCollaborator.$inferSelect,
  'documentId' | 'revision' | 'userId' | 'ordinal'
>;

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
