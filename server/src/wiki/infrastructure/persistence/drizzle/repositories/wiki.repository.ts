import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import {
  WikiCollaborationStateCorruptedError,
  WikiDocumentHistoryCorruptedError,
  WikiDocumentNotFoundError,
  WikiInvalidDocumentMoveError,
} from '@/wiki/domain/wiki.error';
import type {
  WikiDocument,
  WikiDocumentSummary,
} from '@/wiki/domain/wiki-document';
import {
  type WikiDocumentCollaborationState,
  WikiDocumentCollaborationStateSchema,
} from '@/wiki/domain/wiki-document-collaboration-state';
import type {
  WikiDocumentRevision,
  WikiDocumentRevisionSummary,
} from '@/wiki/domain/wiki-document-revision';
import { allocateWikiDocumentTitle } from '@/wiki/domain/wiki-document-title';
import type { CreateWikiDocumentInput } from '@/wiki/dto/create-wiki-document.dto';
import type { WikiCollaborationSnapshot } from '@/wiki/infrastructure/collaboration/wiki-collaboration-state.provider';
import { toWikiDocumentDomain } from '@/wiki/infrastructure/persistence/drizzle/mappers/wiki-document.mapper';
import {
  toWikiDocumentRevisionDomain,
  toWikiDocumentRevisionInsert,
} from '@/wiki/infrastructure/persistence/drizzle/mappers/wiki-document-revision.mapper';
import { wikiCollection } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-collection.schema';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';
import {
  wikiDocumentInsertSchema,
  wikiDocumentUpdateSchema,
} from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod';
import { wikiDocumentRevision } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.schema';
import { wikiDocumentRevisionCollaborator } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision-collaborator.schema';
import type {
  DeleteWikiDocumentResult,
  PersistWikiCollaborationSnapshotResult,
  WikiSearchMatch,
  WikiTree,
} from '@/wiki/infrastructure/persistence/wiki.repository';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';

import { and, asc, desc, eq, ne, or, sql } from 'drizzle-orm';
import * as Y from 'yjs';

const wikiSearchResultLimit = 50;

const wikiDocumentPublicSelection = {
  id: wikiDocument.id,
  collectionId: wikiDocument.collectionId,
  organizationId: wikiDocument.organizationId,
  parentDocumentId: wikiDocument.parentDocumentId,
  title: wikiDocument.title,
  position: wikiDocument.position,
  contentMarkdown: wikiDocument.contentMarkdown,
  revision: wikiDocument.revision,
  createdByUserId: wikiDocument.createdByUserId,
  updatedByUserId: wikiDocument.updatedByUserId,
  createdAt: wikiDocument.createdAt,
  updatedAt: wikiDocument.updatedAt,
};

type WikiTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

@Injectable()
export class WikiDrizzleRepository extends WikiRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly graphEvents: OutboxAggregateChangePublisher,
  ) {
    super();
  }

  async checkCollaborationReady(): Promise<void> {
    await this.database.db
      .select({ collaborationState: wikiDocument.collaborationState })
      .from(wikiDocument)
      .limit(1);
  }

  async getTreeForOrganization(organizationId: string): Promise<WikiTree> {
    const rows = await this.database.db
      .select(wikiDocumentPublicSelection)
      .from(wikiDocument)
      .where(eq(wikiDocument.organizationId, organizationId))
      .orderBy(
        asc(wikiDocument.parentDocumentId),
        asc(wikiDocument.position),
        asc(wikiDocument.title),
        asc(wikiDocument.id),
      );

    return rows.map((row) => toWikiDocumentSummary(toWikiDocumentDomain(row)));
  }

  async findDocumentById(organizationId: string, documentId: string) {
    const [row] = await this.database.db
      .select(wikiDocumentPublicSelection)
      .from(wikiDocument)
      .where(
        and(
          eq(wikiDocument.organizationId, organizationId),
          eq(wikiDocument.id, documentId),
        ),
      )
      .limit(1);

    return row ? toWikiDocumentDomain(row) : null;
  }

  async loadCollaborationState(organizationId: string, documentId: string) {
    const [row] = await this.database.db
      .select({
        id: wikiDocument.id,
        organizationId: wikiDocument.organizationId,
        contentMarkdown: wikiDocument.contentMarkdown,
        collaborationState: wikiDocument.collaborationState,
        collaborationSchemaVersion: wikiDocument.collaborationSchemaVersion,
        collaborationPersistedAt: wikiDocument.collaborationPersistedAt,
      })
      .from(wikiDocument)
      .where(
        and(
          eq(wikiDocument.organizationId, organizationId),
          eq(wikiDocument.id, documentId),
        ),
      )
      .limit(1);

    return row ? WikiDocumentCollaborationStateSchema.parse(row) : null;
  }

  async createDocument(
    organizationId: WikiDocument['organizationId'],
    actorUserId: WikiDocument['createdByUserId'],
    input: CreateWikiDocumentInput,
    collaboration: WikiCollaborationSnapshot,
    collaborationSchemaVersion: WikiDocumentCollaborationState['collaborationSchemaVersion'],
  ) {
    const initialDocument = decodeWikiDocument(collaboration.encodedState);
    if (
      initialDocument.getText('markdown').toJSON() !==
      collaboration.contentMarkdown
    ) {
      throw new WikiCollaborationStateCorruptedError();
    }
    return this.database.db.transaction(async (transaction) => {
      const collection = await ensureAndLockCollection(
        transaction,
        organizationId,
      );
      await assertParentExists(transaction, {
        collectionId: collection.id,
        organizationId,
        parentDocumentId: input.parentDocumentId ?? null,
      });
      const title = await allocateSiblingTitle(transaction, {
        collectionId: collection.id,
        parentDocumentId: input.parentDocumentId ?? null,
        requestedTitle: input.title,
      });
      const now = new Date();
      const [row] = await transaction
        .insert(wikiDocument)
        .values(
          wikiDocumentInsertSchema.parse({
            collectionId: collection.id,
            organizationId,
            parentDocumentId: input.parentDocumentId ?? null,
            title,
            position: input.position ?? 0,
            contentMarkdown: collaboration.contentMarkdown,
            collaborationState: collaboration.encodedState,
            collaborationSchemaVersion,
            collaborationPersistedAt: now,
            revision: 1,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
            createdAt: now,
            updatedAt: now,
          }),
        )
        .returning();

      if (!row) {
        throw new Error('위키 문서 생성 결과가 없습니다.');
      }

      await transaction.insert(wikiDocumentRevision).values(
        toWikiDocumentRevisionInsert({
          documentId: row.id,
          organizationId,
          revision: 1,
          editorUserId: actorUserId,
          contentMarkdown: collaboration.contentMarkdown,
          createdAt: now,
        }),
      );
      await transaction.insert(wikiDocumentRevisionCollaborator).values({
        documentId: row.id,
        revision: 1,
        userId: actorUserId,
        ordinal: 0,
      });

      await this.graphEvents.wikiChanged(
        transaction,
        organizationId,
        row.id,
        'changed',
      );
      return toWikiDocumentDomain(row);
    });
  }

  async updateDocumentMetadata(
    organizationId: WikiDocument['organizationId'],
    documentId: WikiDocument['id'],
    actorUserId: WikiDocument['updatedByUserId'],
    metadata: Pick<WikiDocument, 'parentDocumentId' | 'title' | 'position'>,
  ) {
    return this.database.db.transaction(async (transaction) => {
      const collection = await lockCollectionForOrganization(
        transaction,
        organizationId,
      );
      if (!collection) {
        return null;
      }
      const current = await findDocumentForUpdate(transaction, {
        collectionId: collection.id,
        organizationId,
        documentId,
      });
      if (!current) {
        return null;
      }
      await assertDocumentMoveAllowed(transaction, {
        collectionId: collection.id,
        organizationId,
        documentId,
        parentDocumentId: metadata.parentDocumentId,
      });
      const title = await allocateSiblingTitle(transaction, {
        collectionId: collection.id,
        parentDocumentId: metadata.parentDocumentId,
        requestedTitle: metadata.title,
        excludedDocumentId: documentId,
      });
      const changed =
        current.parentDocumentId !== metadata.parentDocumentId ||
        current.title !== title ||
        current.position !== metadata.position;

      if (!changed) return toWikiDocumentDomain(current);

      const [row] = await transaction
        .update(wikiDocument)
        .set(
          wikiDocumentUpdateSchema.parse({
            parentDocumentId: metadata.parentDocumentId,
            title,
            position: metadata.position,
            updatedByUserId: actorUserId,
            updatedAt: new Date(),
          }),
        )
        .where(
          and(
            eq(wikiDocument.organizationId, organizationId),
            eq(wikiDocument.id, documentId),
          ),
        )
        .returning();

      if (row) {
        await this.graphEvents.wikiChanged(
          transaction,
          organizationId,
          documentId,
          'changed',
        );
      }
      return row ? toWikiDocumentDomain(row) : null;
    });
  }

  async deleteDocument(
    organizationId: string,
    documentId: string,
  ): Promise<DeleteWikiDocumentResult> {
    return this.database.db.transaction(async (transaction) => {
      const collection = await lockCollectionForOrganization(
        transaction,
        organizationId,
      );
      if (!collection) {
        return 'not_found';
      }
      const current = await findDocumentForUpdate(transaction, {
        collectionId: collection.id,
        organizationId,
        documentId,
      });
      if (!current) {
        return 'not_found';
      }
      const [child] = await transaction
        .select({ id: wikiDocument.id })
        .from(wikiDocument)
        .where(
          and(
            eq(wikiDocument.collectionId, collection.id),
            eq(wikiDocument.organizationId, organizationId),
            eq(wikiDocument.parentDocumentId, documentId),
          ),
        )
        .limit(1);
      if (child) {
        return 'not_empty';
      }
      const [deleted] = await transaction
        .delete(wikiDocument)
        .where(
          and(
            eq(wikiDocument.organizationId, organizationId),
            eq(wikiDocument.id, documentId),
          ),
        )
        .returning({ id: wikiDocument.id });
      if (deleted) {
        await this.graphEvents.wikiChanged(
          transaction,
          organizationId,
          documentId,
          'removed',
        );
      }
      return deleted ? 'deleted' : 'not_found';
    });
  }

  async persistCollaborationSnapshot(
    organizationId: WikiDocument['organizationId'],
    documentId: WikiDocument['id'],
    snapshot: WikiCollaborationSnapshot,
    lastEditorUserId: WikiDocument['updatedByUserId'],
    collaboratorUserIds: readonly WikiDocumentRevision['editorUserId'][],
    collaborationSchemaVersion: WikiDocumentCollaborationState['collaborationSchemaVersion'],
    createCheckpoint: boolean,
  ): Promise<PersistWikiCollaborationSnapshotResult> {
    return this.database.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(wikiDocument)
        .where(
          and(
            eq(wikiDocument.organizationId, organizationId),
            eq(wikiDocument.id, documentId),
          ),
        )
        .limit(1)
        .for('update');
      if (!current) {
        throw new WikiDocumentNotFoundError();
      }

      const incoming = decodeWikiDocument(snapshot.encodedState);
      if (incoming.getText('markdown').toJSON() !== snapshot.contentMarkdown) {
        throw new WikiCollaborationStateCorruptedError();
      }
      const merged = decodeWikiDocument(current.collaborationState);
      Y.applyUpdate(merged, snapshot.encodedState);
      const mergedState = Y.encodeStateAsUpdate(merged);
      const mergedMarkdown = merged.getText('markdown').toJSON();
      const stateChanged = !buffersEqual(
        current.collaborationState,
        mergedState,
      );
      const contentChanged = current.contentMarkdown !== mergedMarkdown;
      const now = new Date();

      let nextRevision = current.revision;
      let checkpointCreated = false;
      if (createCheckpoint) {
        const [latestCheckpoint] = await transaction
          .select({ contentMarkdown: wikiDocumentRevision.contentMarkdown })
          .from(wikiDocumentRevision)
          .where(
            and(
              eq(wikiDocumentRevision.documentId, documentId),
              eq(wikiDocumentRevision.revision, current.revision),
            ),
          )
          .limit(1);
        if (!latestCheckpoint) {
          throw new WikiDocumentHistoryCorruptedError();
        }
        if (latestCheckpoint.contentMarkdown !== mergedMarkdown) {
          nextRevision = current.revision + 1;
          checkpointCreated = true;
        }
      }

      await transaction
        .update(wikiDocument)
        .set(
          wikiDocumentUpdateSchema.parse({
            collaborationState: mergedState,
            collaborationSchemaVersion,
            collaborationPersistedAt: now,
            contentMarkdown: mergedMarkdown,
            revision: nextRevision,
            updatedByUserId: lastEditorUserId,
            updatedAt: contentChanged ? now : current.updatedAt,
          }),
        )
        .where(eq(wikiDocument.id, documentId));

      if (checkpointCreated) {
        await transaction.insert(wikiDocumentRevision).values(
          toWikiDocumentRevisionInsert({
            documentId,
            organizationId,
            revision: nextRevision,
            editorUserId: lastEditorUserId,
            contentMarkdown: mergedMarkdown,
            createdAt: now,
          }),
        );
        const collaborators = uniqueCollaborators(
          collaboratorUserIds,
          lastEditorUserId,
        );
        if (collaborators.length > 0) {
          await transaction.insert(wikiDocumentRevisionCollaborator).values(
            collaborators.map((userId, ordinal) => ({
              documentId,
              revision: nextRevision,
              userId,
              ordinal,
            })),
          );
        }
      }

      if (contentChanged) {
        await this.graphEvents.wikiChanged(
          transaction,
          organizationId,
          documentId,
          'changed',
        );
      }

      return {
        changed: stateChanged || contentChanged,
        checkpointCreated,
        revision: nextRevision,
        contentMarkdown: mergedMarkdown,
        encodedState: mergedState,
      };
    });
  }

  async listDocumentRevisions(
    organizationId: string,
    documentId: string,
  ): Promise<WikiDocumentRevisionSummary[]> {
    const [rows, collaboratorRows] = await Promise.all([
      this.database.db
        .select()
        .from(wikiDocumentRevision)
        .where(
          and(
            eq(wikiDocumentRevision.organizationId, organizationId),
            eq(wikiDocumentRevision.documentId, documentId),
          ),
        )
        .orderBy(desc(wikiDocumentRevision.revision)),
      this.database.db
        .select({
          revision: wikiDocumentRevisionCollaborator.revision,
          userId: wikiDocumentRevisionCollaborator.userId,
        })
        .from(wikiDocumentRevisionCollaborator)
        .where(eq(wikiDocumentRevisionCollaborator.documentId, documentId))
        .orderBy(
          asc(wikiDocumentRevisionCollaborator.revision),
          asc(wikiDocumentRevisionCollaborator.ordinal),
        ),
    ]);
    const collaboratorsByRevision =
      groupCollaboratorsByRevision(collaboratorRows);
    return rows.map((row) =>
      toWikiDocumentRevisionSummary(
        toWikiDocumentRevisionDomain(
          row,
          collaboratorsByRevision.get(row.revision) ?? [],
        ),
      ),
    );
  }

  async findDocumentRevision(
    organizationId: string,
    documentId: string,
    revision: number,
  ): Promise<WikiDocumentRevision | null> {
    const [row] = await this.database.db
      .select()
      .from(wikiDocumentRevision)
      .where(
        and(
          eq(wikiDocumentRevision.organizationId, organizationId),
          eq(wikiDocumentRevision.documentId, documentId),
          eq(wikiDocumentRevision.revision, revision),
        ),
      )
      .limit(1);
    if (!row) {
      return null;
    }
    const collaboratorRows = await this.database.db
      .select({ userId: wikiDocumentRevisionCollaborator.userId })
      .from(wikiDocumentRevisionCollaborator)
      .where(
        and(
          eq(wikiDocumentRevisionCollaborator.documentId, documentId),
          eq(wikiDocumentRevisionCollaborator.revision, revision),
        ),
      )
      .orderBy(asc(wikiDocumentRevisionCollaborator.ordinal));
    return toWikiDocumentRevisionDomain(
      row,
      collaboratorRows.map(({ userId }) => userId),
    );
  }

  async search(
    organizationId: string,
    query: string,
  ): Promise<WikiSearchMatch[]> {
    const pattern = toLikeContainsPattern(query.trim());
    const titleMatched = sql<boolean>`${wikiDocument.title} ilike ${pattern}`;
    const contentMatched = sql<boolean>`${wikiDocument.contentMarkdown} ilike ${pattern}`;
    const rows = await this.database.db
      .select({
        documentId: wikiDocument.id,
        parentDocumentId: wikiDocument.parentDocumentId,
        title: wikiDocument.title,
        titleMatched,
        contentMatched,
      })
      .from(wikiDocument)
      .where(
        and(
          eq(wikiDocument.organizationId, organizationId),
          or(titleMatched, contentMatched),
        ),
      )
      .orderBy(asc(wikiDocument.title), asc(wikiDocument.id))
      .limit(wikiSearchResultLimit);

    return rows.map((row) => ({
      documentId: row.documentId,
      parentDocumentId: row.parentDocumentId,
      title: row.title,
      matchedIn: [
        ...(row.titleMatched ? (['title'] as const) : []),
        ...(row.contentMatched ? (['content'] as const) : []),
      ],
    }));
  }
}

function toWikiDocumentSummary(document: WikiDocument): WikiDocumentSummary {
  const { contentMarkdown, ...summary } = document;
  void contentMarkdown;
  return summary;
}

function toWikiDocumentRevisionSummary(
  revision: WikiDocumentRevision,
): WikiDocumentRevisionSummary {
  const { contentMarkdown, ...summary } = revision;
  void contentMarkdown;
  return summary;
}

async function ensureAndLockCollection(
  transaction: WikiTransaction,
  organizationId: string,
) {
  await transaction
    .insert(wikiCollection)
    .values({ organizationId })
    .onConflictDoNothing({ target: wikiCollection.organizationId });
  const collection = await lockCollectionForOrganization(
    transaction,
    organizationId,
  );
  if (!collection) {
    throw new Error('위키 collection 생성 결과가 없습니다.');
  }
  return collection;
}

async function lockCollectionForOrganization(
  transaction: WikiTransaction,
  organizationId: string,
) {
  const [collection] = await transaction
    .select()
    .from(wikiCollection)
    .where(eq(wikiCollection.organizationId, organizationId))
    .limit(1)
    .for('update');
  return collection ?? null;
}

async function assertParentExists(
  transaction: WikiTransaction,
  input: {
    collectionId: string;
    organizationId: string;
    parentDocumentId: string | null;
  },
): Promise<void> {
  if (input.parentDocumentId === null) {
    return;
  }
  const [parent] = await transaction
    .select({ id: wikiDocument.id })
    .from(wikiDocument)
    .where(
      and(
        eq(wikiDocument.collectionId, input.collectionId),
        eq(wikiDocument.organizationId, input.organizationId),
        eq(wikiDocument.id, input.parentDocumentId),
      ),
    )
    .limit(1);
  if (!parent) {
    throw new WikiDocumentNotFoundError();
  }
}

async function findDocumentForUpdate(
  transaction: WikiTransaction,
  input: {
    collectionId: string;
    organizationId: string;
    documentId: string;
  },
) {
  const [row] = await transaction
    .select()
    .from(wikiDocument)
    .where(
      and(
        eq(wikiDocument.collectionId, input.collectionId),
        eq(wikiDocument.organizationId, input.organizationId),
        eq(wikiDocument.id, input.documentId),
      ),
    )
    .limit(1)
    .for('update');
  return row ?? null;
}

async function assertDocumentMoveAllowed(
  transaction: WikiTransaction,
  input: {
    collectionId: string;
    organizationId: string;
    documentId: string;
    parentDocumentId: string | null;
  },
): Promise<void> {
  let currentId = input.parentDocumentId;
  const visited = new Set<string>();
  while (currentId !== null) {
    if (currentId === input.documentId || visited.has(currentId)) {
      throw new WikiInvalidDocumentMoveError();
    }
    visited.add(currentId);
    const [current] = await transaction
      .select({ parentDocumentId: wikiDocument.parentDocumentId })
      .from(wikiDocument)
      .where(
        and(
          eq(wikiDocument.collectionId, input.collectionId),
          eq(wikiDocument.organizationId, input.organizationId),
          eq(wikiDocument.id, currentId),
        ),
      )
      .limit(1);
    if (!current) {
      throw new WikiDocumentNotFoundError();
    }
    currentId = current.parentDocumentId;
  }
}

async function allocateSiblingTitle(
  transaction: WikiTransaction,
  input: {
    collectionId: string;
    parentDocumentId: string | null;
    requestedTitle: string;
    excludedDocumentId?: string;
  },
): Promise<string> {
  const conditions = [
    eq(wikiDocument.collectionId, input.collectionId),
    input.parentDocumentId === null
      ? sql`${wikiDocument.parentDocumentId} is null`
      : eq(wikiDocument.parentDocumentId, input.parentDocumentId),
  ];
  if (input.excludedDocumentId) {
    conditions.push(ne(wikiDocument.id, input.excludedDocumentId));
  }
  const siblings = await transaction
    .select({ title: wikiDocument.title })
    .from(wikiDocument)
    .where(and(...conditions));
  return allocateWikiDocumentTitle(
    input.requestedTitle,
    new Set(siblings.map(({ title }) => title)),
  );
}

function decodeWikiDocument(encodedState: Uint8Array): Y.Doc {
  try {
    const document = new Y.Doc();
    Y.applyUpdate(document, encodedState);
    document.getText('markdown');
    return document;
  } catch (error) {
    throw new WikiCollaborationStateCorruptedError({ cause: error });
  }
}

function buffersEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

function groupCollaboratorsByRevision(
  rows: readonly { revision: number; userId: string }[],
): Map<number, string[]> {
  const result = new Map<number, string[]>();
  for (const row of rows) {
    const collaborators = result.get(row.revision) ?? [];
    collaborators.push(row.userId);
    result.set(row.revision, collaborators);
  }
  return result;
}

function uniqueCollaborators(
  collaboratorUserIds: readonly string[],
  lastEditorUserId: string,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const userId of [...collaboratorUserIds, lastEditorUserId]) {
    if (!seen.has(userId)) {
      seen.add(userId);
      result.push(userId);
    }
  }
  return result;
}

function toLikeContainsPattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, '\\$&');
  return `%${escaped}%`;
}
