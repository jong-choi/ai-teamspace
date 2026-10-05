import { Injectable } from '@nestjs/common';

import { DatabaseService } from '#server/database/database.service.js';
import {
  cutoverWikiDocument,
  legacyWikiEntry,
} from '#server/wiki/cutover/infrastructure/drizzle/legacy-wiki-tables.js';
import {
  WikiCollaborationCutoverRepository,
  type WikiCollaborationCutoverRepository as WikiCollaborationCutoverRepositoryPort,
  type WikiCutoverDocumentInput,
  type WikiCutoverFinalSnapshot,
  type WikiCutoverSnapshot,
} from '#server/wiki/cutover/wiki-collaboration-cutover.repository.js';
import { wikiCollection } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-collection.schema.js';
import { wikiDocumentRevision } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.schema.js';
import { wikiDocumentRevisionCollaborator } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision-collaborator.schema.js';

import { eq, inArray } from 'drizzle-orm';

@Injectable()
export class WikiCollaborationCutoverDrizzleRepository
  extends WikiCollaborationCutoverRepository
  implements WikiCollaborationCutoverRepositoryPort
{
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async loadSnapshot(): Promise<WikiCutoverSnapshot> {
    const [entries, documents, revisions] = await Promise.all([
      this.database.db.select().from(legacyWikiEntry),
      this.database.db.select().from(cutoverWikiDocument),
      this.database.db
        .select({
          documentId: wikiDocumentRevision.documentId,
          organizationId: wikiDocumentRevision.organizationId,
          revision: wikiDocumentRevision.revision,
          editorUserId: wikiDocumentRevision.editorUserId,
          contentMarkdown: wikiDocumentRevision.contentMarkdown,
        })
        .from(wikiDocumentRevision),
    ]);
    return {
      entries,
      documents: documents.map((document) => ({
        id: document.id,
        collectionId: document.collectionId,
        organizationId: document.organizationId,
        parentDocumentId: document.parentDocumentId,
        title: document.title,
        position: document.position,
        contentMarkdown: document.contentMarkdown,
        collaborationState: document.collaborationState,
        collaborationSchemaVersion: document.collaborationSchemaVersion,
        revision: document.revision,
        createdByUserId: document.createdByUserId,
        updatedByUserId: document.updatedByUserId,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      })),
      revisions,
    };
  }

  async convertOrganization(
    organizationId: string,
    documents: readonly WikiCutoverDocumentInput[],
  ): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      const [collection] = await transaction
        .insert(wikiCollection)
        .values({ organizationId })
        .onConflictDoUpdate({
          target: wikiCollection.organizationId,
          set: { updatedAt: new Date() },
        })
        .returning();
      if (!collection) {
        throw new Error('위키 collection 생성 결과가 없습니다.');
      }

      await transaction
        .select({ id: wikiCollection.id })
        .from(wikiCollection)
        .where(eq(wikiCollection.id, collection.id))
        .limit(1)
        .for('update');

      for (const document of documents) {
        const existing = await transaction
          .select({
            id: cutoverWikiDocument.id,
            collectionId: cutoverWikiDocument.collectionId,
            organizationId: cutoverWikiDocument.organizationId,
            parentDocumentId: cutoverWikiDocument.parentDocumentId,
            title: cutoverWikiDocument.title,
            position: cutoverWikiDocument.position,
            collaborationState: cutoverWikiDocument.collaborationState,
            collaborationSchemaVersion:
              cutoverWikiDocument.collaborationSchemaVersion,
            contentMarkdown: cutoverWikiDocument.contentMarkdown,
            revision: cutoverWikiDocument.revision,
            createdByUserId: cutoverWikiDocument.createdByUserId,
            updatedByUserId: cutoverWikiDocument.updatedByUserId,
            createdAt: cutoverWikiDocument.createdAt,
            updatedAt: cutoverWikiDocument.updatedAt,
          })
          .from(cutoverWikiDocument)
          .where(eq(cutoverWikiDocument.id, document.entry.id))
          .limit(1);

        const current = existing[0];
        if (current?.collaborationState) {
          assertInitializedDocumentMatches(current, {
            collectionId: collection.id,
            organizationId,
            document,
          });
          continue;
        }

        if (current) {
          await transaction
            .update(cutoverWikiDocument)
            .set({
              collectionId: collection.id,
              organizationId,
              parentDocumentId: document.entry.parentFolderId,
              title: document.entry.name,
              position: document.entry.position,
              contentMarkdown: document.contentMarkdown,
              collaborationState: document.collaborationState,
              collaborationSchemaVersion: document.collaborationSchemaVersion,
              collaborationPersistedAt: document.entry.updatedAt,
              revision: document.revision,
              createdByUserId: document.entry.createdByUserId,
              updatedByUserId: document.updatedByUserId,
              createdAt: document.entry.createdAt,
              updatedAt: document.entry.updatedAt,
            })
            .where(eq(cutoverWikiDocument.id, document.entry.id));
          continue;
        }

        await transaction.insert(cutoverWikiDocument).values({
          id: document.entry.id,
          collectionId: collection.id,
          organizationId,
          parentDocumentId: document.entry.parentFolderId,
          title: document.entry.name,
          position: document.entry.position,
          contentMarkdown: document.contentMarkdown,
          collaborationState: document.collaborationState,
          collaborationSchemaVersion: document.collaborationSchemaVersion,
          collaborationPersistedAt: document.entry.updatedAt,
          revision: document.revision,
          createdByUserId: document.entry.createdByUserId,
          updatedByUserId: document.updatedByUserId,
          createdAt: document.entry.createdAt,
          updatedAt: document.entry.updatedAt,
        });

        await transaction
          .insert(wikiDocumentRevision)
          .values({
            documentId: document.entry.id,
            organizationId,
            revision: document.revision,
            editorUserId: document.updatedByUserId,
            contentMarkdown: document.contentMarkdown,
            createdAt: document.entry.updatedAt,
          })
          .onConflictDoNothing({
            target: [
              wikiDocumentRevision.documentId,
              wikiDocumentRevision.revision,
            ],
          });
        await transaction
          .insert(wikiDocumentRevisionCollaborator)
          .values({
            documentId: document.entry.id,
            revision: document.revision,
            userId: document.updatedByUserId,
            ordinal: 0,
          })
          .onConflictDoNothing({
            target: [
              wikiDocumentRevisionCollaborator.documentId,
              wikiDocumentRevisionCollaborator.revision,
              wikiDocumentRevisionCollaborator.userId,
            ],
          });
      }

      const documentIds = documents.map((document) => document.entry.id);
      if (documentIds.length > 0) {
        const revisions = await transaction
          .select({
            documentId: wikiDocumentRevision.documentId,
            revision: wikiDocumentRevision.revision,
            editorUserId: wikiDocumentRevision.editorUserId,
          })
          .from(wikiDocumentRevision)
          .where(inArray(wikiDocumentRevision.documentId, documentIds));
        if (revisions.length > 0) {
          await transaction
            .insert(wikiDocumentRevisionCollaborator)
            .values(
              revisions.map((revision) => ({
                documentId: revision.documentId,
                revision: revision.revision,
                userId: revision.editorUserId,
                ordinal: 0,
              })),
            )
            .onConflictDoNothing();
        }
      }
    });
  }

  async loadFinalSnapshot(): Promise<WikiCutoverFinalSnapshot> {
    const [collections, documents, revisions, revisionCollaborators] =
      await Promise.all([
        this.database.db
          .select({ organizationId: wikiCollection.organizationId })
          .from(wikiCollection),
        this.database.db.select().from(cutoverWikiDocument),
        this.database.db
          .select({
            documentId: wikiDocumentRevision.documentId,
            organizationId: wikiDocumentRevision.organizationId,
            revision: wikiDocumentRevision.revision,
            editorUserId: wikiDocumentRevision.editorUserId,
            contentMarkdown: wikiDocumentRevision.contentMarkdown,
          })
          .from(wikiDocumentRevision),
        this.database.db
          .select({
            documentId: wikiDocumentRevisionCollaborator.documentId,
            revision: wikiDocumentRevisionCollaborator.revision,
            userId: wikiDocumentRevisionCollaborator.userId,
            ordinal: wikiDocumentRevisionCollaborator.ordinal,
          })
          .from(wikiDocumentRevisionCollaborator),
      ]);
    return {
      collectionOrganizationIds: collections.map(
        (collection) => collection.organizationId,
      ),
      documents,
      revisions,
      revisionCollaborators,
    };
  }
}

function assertInitializedDocumentMatches(
  current: {
    collectionId: string | null;
    organizationId: string | null;
    parentDocumentId: string | null;
    title: string | null;
    position: number | null;
    contentMarkdown: string;
    collaborationSchemaVersion: number | null;
    revision: number;
    createdByUserId: string | null;
    updatedByUserId: string;
    createdAt: Date | null;
    updatedAt: Date | null;
  },
  expected: {
    collectionId: string;
    organizationId: string;
    document: WikiCutoverDocumentInput;
  },
): void {
  const { document } = expected;
  const matches =
    current.collectionId === expected.collectionId &&
    current.organizationId === expected.organizationId &&
    current.parentDocumentId === document.entry.parentFolderId &&
    current.title === document.entry.name &&
    current.position === document.entry.position &&
    current.contentMarkdown === document.contentMarkdown &&
    current.collaborationSchemaVersion ===
      document.collaborationSchemaVersion &&
    current.revision === document.revision &&
    current.createdByUserId === document.entry.createdByUserId &&
    current.updatedByUserId === document.updatedByUserId &&
    current.createdAt?.getTime() === document.entry.createdAt.getTime() &&
    current.updatedAt?.getTime() === document.entry.updatedAt.getTime();
  if (!matches) {
    throw new Error(
      `이미 초기화된 위키 문서 metadata가 다릅니다: ${document.entry.id}`,
    );
  }
}
