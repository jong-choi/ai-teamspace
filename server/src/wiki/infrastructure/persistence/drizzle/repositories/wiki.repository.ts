import { Injectable } from '@nestjs/common';

import { DatabaseService } from '#server/database/database.service.js';
import {
  WikiFolderNotFoundError,
  WikiInvalidFolderMoveError,
} from '#server/wiki/domain/wiki.error.js';
import type {
  WikiDocument,
  WikiDocumentSummary,
} from '#server/wiki/domain/wiki-document.js';
import type {
  WikiDocumentRevision,
  WikiDocumentRevisionSummary,
} from '#server/wiki/domain/wiki-document-revision.js';
import {
  WIKI_EDIT_LOCK_LEASE_SECONDS,
  type WikiEditLock,
} from '#server/wiki/domain/wiki-edit-lock.js';
import { buildWikiEntryNameCandidate } from '#server/wiki/domain/wiki-entry-name.js';
import {
  toWikiDocumentDomain,
  toWikiDocumentEntryInsert,
  toWikiDocumentEntryUpdate,
  toWikiDocumentInsert,
  toWikiDocumentUpdate,
} from '#server/wiki/infrastructure/persistence/drizzle/mappers/wiki-document.mapper.js';
import {
  toWikiDocumentRevisionDomain,
  toWikiDocumentRevisionInsert,
} from '#server/wiki/infrastructure/persistence/drizzle/mappers/wiki-document-revision.mapper.js';
import { toWikiEditLockDomain } from '#server/wiki/infrastructure/persistence/drizzle/mappers/wiki-edit-lock.mapper.js';
import {
  toWikiFolderDomain,
  toWikiFolderInsert,
  toWikiFolderUpdate,
} from '#server/wiki/infrastructure/persistence/drizzle/mappers/wiki-folder.mapper.js';
import { isPostgresConstraintViolation } from '#server/wiki/infrastructure/persistence/drizzle/postgres-error.js';
import { wikiDocument } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema.js';
import { wikiDocumentEditLock } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-edit-lock.schema.js';
import { wikiDocumentRevision } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.schema.js';
import { wikiEntry } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.schema.js';
import {
  type CreateWikiDocumentPersistenceInput,
  type CreateWikiFolderPersistenceInput,
  type DeleteWikiFolderResult,
  type SaveWikiDocumentContentPersistenceInput,
  type SaveWikiDocumentContentPersistenceResult,
  type UpdateWikiDocumentMetadataPersistenceInput,
  type UpdateWikiFolderPersistenceInput,
  type WikiEditLockPersistenceInput,
  WikiRepository,
  type WikiSearchMatch,
  type WikiTree,
} from '#server/wiki/infrastructure/persistence/wiki.repository.js';

import { and, asc, desc, eq, gt, ilike, lte, or, sql } from 'drizzle-orm';

const wikiEntryNameConstraint = 'wiki_entry_organization_parent_name_unique';
const wikiEntryParentFolderConstraint = 'wiki_entry_parent_organization_fk';
const wikiSearchResultLimit = 50;

type WikiTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

@Injectable()
export class WikiDrizzleRepository extends WikiRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async getTreeForOrganization(organizationId: string): Promise<WikiTree> {
    const rows = await this.database.db
      .select({ entry: wikiEntry, document: wikiDocument })
      .from(wikiEntry)
      .leftJoin(wikiDocument, eq(wikiDocument.id, wikiEntry.id))
      .where(eq(wikiEntry.organizationId, organizationId))
      .orderBy(
        asc(wikiEntry.parentFolderId),
        asc(wikiEntry.position),
        asc(wikiEntry.name),
        asc(wikiEntry.id),
      );

    const folders = [];
    const documents: WikiDocumentSummary[] = [];

    for (const row of rows) {
      if (row.entry.kind === 'folder') {
        folders.push(toWikiFolderDomain(row.entry));
        continue;
      }
      if (!row.document) {
        throw new Error('위키 문서 세부 행이 없습니다.');
      }
      documents.push(toWikiDocumentSummary(toWikiDocumentDomain(row)));
    }

    return { folders, documents };
  }

  async findFolderById(organizationId: string, folderId: string) {
    const [row] = await this.database.db
      .select()
      .from(wikiEntry)
      .where(
        and(
          eq(wikiEntry.organizationId, organizationId),
          eq(wikiEntry.id, folderId),
          eq(wikiEntry.kind, 'folder'),
        ),
      )
      .limit(1);

    return row ? toWikiFolderDomain(row) : null;
  }

  async createFolder(input: CreateWikiFolderPersistenceInput) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const [row] = await this.database.db
          .insert(wikiEntry)
          .values(
            toWikiFolderInsert({
              ...input,
              name: buildWikiEntryNameCandidate(input.name, attempt),
            }),
          )
          .onConflictDoNothing({
            target: [
              wikiEntry.organizationId,
              wikiEntry.parentFolderId,
              wikiEntry.name,
            ],
          })
          .returning();

        if (row) {
          return toWikiFolderDomain(row);
        }
      } catch (error) {
        if (
          isPostgresConstraintViolation(
            error,
            '23503',
            wikiEntryParentFolderConstraint,
          )
        ) {
          throw new WikiFolderNotFoundError({ cause: error });
        }
        throw error;
      }
    }
  }

  async updateFolder(input: UpdateWikiFolderPersistenceInput) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.database.db.transaction(async (transaction) => {
          await lockWikiHierarchy(transaction, input.organizationId);
          const [current] = await transaction
            .select()
            .from(wikiEntry)
            .where(
              and(
                eq(wikiEntry.organizationId, input.organizationId),
                eq(wikiEntry.id, input.folderId),
                eq(wikiEntry.kind, 'folder'),
              ),
            )
            .limit(1)
            .for('update');

          if (!current) {
            return null;
          }

          await assertFolderMoveAllowedInTransaction(transaction, {
            organizationId: input.organizationId,
            folderId: input.folderId,
            targetParentFolderId: input.parentFolderId,
          });

          const [row] = await transaction
            .update(wikiEntry)
            .set(
              toWikiFolderUpdate({
                parentFolderId: input.parentFolderId,
                name: buildWikiEntryNameCandidate(input.name, attempt),
                position: input.position,
                updatedAt: new Date(),
              }),
            )
            .where(eq(wikiEntry.id, input.folderId))
            .returning();

          return row ? toWikiFolderDomain(row) : null;
        });
      } catch (error) {
        if (
          isPostgresConstraintViolation(error, '23505', wikiEntryNameConstraint)
        ) {
          continue;
        }
        if (
          isPostgresConstraintViolation(
            error,
            '23503',
            wikiEntryParentFolderConstraint,
          )
        ) {
          throw new WikiFolderNotFoundError({ cause: error });
        }
        throw error;
      }
    }
  }

  async deleteFolder(
    organizationId: string,
    folderId: string,
  ): Promise<DeleteWikiFolderResult> {
    try {
      const [row] = await this.database.db
        .delete(wikiEntry)
        .where(
          and(
            eq(wikiEntry.organizationId, organizationId),
            eq(wikiEntry.id, folderId),
            eq(wikiEntry.kind, 'folder'),
          ),
        )
        .returning({ id: wikiEntry.id });

      return row ? 'deleted' : 'not_found';
    } catch (error) {
      if (
        isPostgresConstraintViolation(
          error,
          '23503',
          wikiEntryParentFolderConstraint,
        )
      ) {
        return 'not_empty';
      }
      throw error;
    }
  }

  async findDocumentById(organizationId: string, documentId: string) {
    const [row] = await this.database.db
      .select({ entry: wikiEntry, document: wikiDocument })
      .from(wikiEntry)
      .innerJoin(wikiDocument, eq(wikiDocument.id, wikiEntry.id))
      .where(
        and(
          eq(wikiEntry.organizationId, organizationId),
          eq(wikiEntry.id, documentId),
          eq(wikiEntry.kind, 'document'),
        ),
      )
      .limit(1);

    return row ? toWikiDocumentDomain(row) : null;
  }

  async createDocument(input: CreateWikiDocumentPersistenceInput) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await this.database.db.transaction(
          async (transaction) => {
            const [entry] = await transaction
              .insert(wikiEntry)
              .values(
                toWikiDocumentEntryInsert({
                  ...input,
                  title: buildWikiEntryNameCandidate(input.title, attempt),
                }),
              )
              .onConflictDoNothing({
                target: [
                  wikiEntry.organizationId,
                  wikiEntry.parentFolderId,
                  wikiEntry.name,
                ],
              })
              .returning();

            if (!entry) {
              return null;
            }

            const [document] = await transaction
              .insert(wikiDocument)
              .values(
                toWikiDocumentInsert({
                  id: entry.id,
                  contentMarkdown: input.contentMarkdown,
                  actorUserId: input.actorUserId,
                }),
              )
              .returning();

            if (!document) {
              throw new Error('위키 문서 생성 결과가 없습니다.');
            }

            await transaction.insert(wikiDocumentRevision).values(
              toWikiDocumentRevisionInsert({
                documentId: entry.id,
                organizationId: input.organizationId,
                revision: document.revision,
                editorUserId: input.actorUserId,
                contentMarkdown: document.contentMarkdown,
                createdAt: entry.updatedAt,
              }),
            );

            return toWikiDocumentDomain({ entry, document });
          },
        );

        if (result) {
          return result;
        }
      } catch (error) {
        if (
          isPostgresConstraintViolation(
            error,
            '23503',
            wikiEntryParentFolderConstraint,
          )
        ) {
          throw new WikiFolderNotFoundError({ cause: error });
        }
        throw error;
      }
    }
  }

  async updateDocumentMetadata(
    input: UpdateWikiDocumentMetadataPersistenceInput,
  ) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.database.db.transaction(async (transaction) => {
          const [current] = await transaction
            .select({ entry: wikiEntry, document: wikiDocument })
            .from(wikiEntry)
            .innerJoin(wikiDocument, eq(wikiDocument.id, wikiEntry.id))
            .where(
              and(
                eq(wikiEntry.organizationId, input.organizationId),
                eq(wikiEntry.id, input.documentId),
                eq(wikiEntry.kind, 'document'),
              ),
            )
            .limit(1)
            .for('update', { of: [wikiEntry, wikiDocument] });

          if (!current) {
            return null;
          }

          const [entry] = await transaction
            .update(wikiEntry)
            .set(
              toWikiDocumentEntryUpdate({
                folderId: input.folderId,
                title: buildWikiEntryNameCandidate(input.title, attempt),
                updatedAt: new Date(),
              }),
            )
            .where(eq(wikiEntry.id, input.documentId))
            .returning();

          const [document] = await transaction
            .update(wikiDocument)
            .set(
              toWikiDocumentUpdate({
                actorUserId: input.actorUserId,
              }),
            )
            .where(eq(wikiDocument.id, input.documentId))
            .returning();

          if (!entry || !document) {
            throw new Error('위키 문서 metadata 수정 결과가 없습니다.');
          }

          return toWikiDocumentDomain({ entry, document });
        });
      } catch (error) {
        if (
          isPostgresConstraintViolation(error, '23505', wikiEntryNameConstraint)
        ) {
          continue;
        }
        if (
          isPostgresConstraintViolation(
            error,
            '23503',
            wikiEntryParentFolderConstraint,
          )
        ) {
          throw new WikiFolderNotFoundError({ cause: error });
        }
        throw error;
      }
    }
  }

  async deleteDocument(
    organizationId: string,
    documentId: string,
  ): Promise<boolean> {
    const [row] = await this.database.db
      .delete(wikiEntry)
      .where(
        and(
          eq(wikiEntry.organizationId, organizationId),
          eq(wikiEntry.id, documentId),
          eq(wikiEntry.kind, 'document'),
        ),
      )
      .returning({ id: wikiEntry.id });

    return Boolean(row);
  }

  async acquireEditLock(
    input: WikiEditLockPersistenceInput,
  ): Promise<WikiEditLock | null> {
    const [lock] = await this.database.db
      .insert(wikiDocumentEditLock)
      .values({
        documentId: input.documentId,
        organizationId: input.organizationId,
        lockedByUserId: input.actorUserId,
        acquiredAt: databaseNow(),
        expiresAt: editLockExpiry(),
      })
      .onConflictDoUpdate({
        target: wikiDocumentEditLock.documentId,
        set: {
          organizationId: input.organizationId,
          lockedByUserId: input.actorUserId,
          acquiredAt: databaseNow(),
          expiresAt: editLockExpiry(),
        },
        setWhere: or(
          eq(wikiDocumentEditLock.lockedByUserId, input.actorUserId),
          lte(wikiDocumentEditLock.expiresAt, databaseNow()),
        ),
      })
      .returning();

    if (lock) {
      return toWikiEditLockDomain(lock);
    }
    return this.findActiveEditLock(input.organizationId, input.documentId);
  }

  async renewEditLock(
    input: WikiEditLockPersistenceInput,
  ): Promise<WikiEditLock | null> {
    const [lock] = await this.database.db
      .update(wikiDocumentEditLock)
      .set({ expiresAt: editLockExpiry() })
      .where(
        and(
          eq(wikiDocumentEditLock.documentId, input.documentId),
          eq(wikiDocumentEditLock.organizationId, input.organizationId),
          eq(wikiDocumentEditLock.lockedByUserId, input.actorUserId),
          gt(wikiDocumentEditLock.expiresAt, databaseNow()),
        ),
      )
      .returning();

    if (lock) {
      return toWikiEditLockDomain(lock);
    }
    return this.findActiveEditLock(input.organizationId, input.documentId);
  }

  async releaseEditLock(
    input: WikiEditLockPersistenceInput,
  ): Promise<WikiEditLock | null> {
    const [released] = await this.database.db
      .delete(wikiDocumentEditLock)
      .where(
        and(
          eq(wikiDocumentEditLock.documentId, input.documentId),
          eq(wikiDocumentEditLock.organizationId, input.organizationId),
          eq(wikiDocumentEditLock.lockedByUserId, input.actorUserId),
        ),
      )
      .returning({ documentId: wikiDocumentEditLock.documentId });

    if (released) {
      return null;
    }
    return this.findActiveEditLock(input.organizationId, input.documentId);
  }

  async saveDocumentContent(
    input: SaveWikiDocumentContentPersistenceInput,
  ): Promise<SaveWikiDocumentContentPersistenceResult> {
    return this.database.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ entry: wikiEntry, document: wikiDocument })
        .from(wikiEntry)
        .innerJoin(wikiDocument, eq(wikiDocument.id, wikiEntry.id))
        .where(
          and(
            eq(wikiEntry.organizationId, input.organizationId),
            eq(wikiEntry.id, input.documentId),
            eq(wikiEntry.kind, 'document'),
          ),
        )
        .limit(1)
        .for('update', { of: [wikiEntry, wikiDocument] });

      if (!current) {
        return { status: 'not_found' };
      }

      const [activeLock] = await transaction
        .select()
        .from(wikiDocumentEditLock)
        .where(
          and(
            eq(wikiDocumentEditLock.documentId, input.documentId),
            eq(wikiDocumentEditLock.organizationId, input.organizationId),
            gt(wikiDocumentEditLock.expiresAt, databaseNow()),
          ),
        )
        .limit(1)
        .for('update');

      if (!activeLock) {
        return { status: 'lock_required' };
      }
      if (activeLock.lockedByUserId !== input.actorUserId) {
        return { status: 'locked_by_other' };
      }

      await transaction
        .insert(wikiDocumentRevision)
        .values(
          toWikiDocumentRevisionInsert({
            documentId: current.entry.id,
            organizationId: current.entry.organizationId,
            revision: current.document.revision,
            editorUserId: current.document.updatedByUserId,
            contentMarkdown: current.document.contentMarkdown,
            createdAt: current.entry.updatedAt,
          }),
        )
        .onConflictDoNothing({
          target: [
            wikiDocumentRevision.documentId,
            wikiDocumentRevision.revision,
          ],
        });

      const canonicalDocument = toWikiDocumentDomain(current);
      if (current.document.revision !== input.baseRevision) {
        const conflictCopy = await createConflictCopy({
          transaction,
          entry: current.entry,
          organizationId: input.organizationId,
          contentMarkdown: input.contentMarkdown,
          actorUserId: input.actorUserId,
        });
        return {
          status: 'conflict_copy_created',
          document: canonicalDocument,
          conflictCopy,
        };
      }

      const nextRevision = current.document.revision + 1;
      const updatedAt = new Date();
      const [entry] = await transaction
        .update(wikiEntry)
        .set({ updatedAt })
        .where(eq(wikiEntry.id, input.documentId))
        .returning();
      const [document] = await transaction
        .update(wikiDocument)
        .set(
          toWikiDocumentUpdate({
            contentMarkdown: input.contentMarkdown,
            revision: nextRevision,
            actorUserId: input.actorUserId,
          }),
        )
        .where(eq(wikiDocument.id, input.documentId))
        .returning();

      if (!entry || !document) {
        throw new Error('위키 문서 저장 결과가 없습니다.');
      }

      await transaction.insert(wikiDocumentRevision).values(
        toWikiDocumentRevisionInsert({
          documentId: input.documentId,
          organizationId: input.organizationId,
          revision: nextRevision,
          editorUserId: input.actorUserId,
          contentMarkdown: input.contentMarkdown,
          createdAt: updatedAt,
        }),
      );

      return {
        status: 'saved',
        document: toWikiDocumentDomain({ entry, document }),
      };
    });
  }

  async listDocumentRevisions(
    organizationId: string,
    documentId: string,
  ): Promise<WikiDocumentRevisionSummary[]> {
    const [rows, currentDocument] = await Promise.all([
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
      this.findDocumentById(organizationId, documentId),
    ]);

    const revisions = rows.map((row) =>
      toWikiDocumentRevisionSummary(toWikiDocumentRevisionDomain(row)),
    );
    if (
      currentDocument &&
      !revisions.some(({ revision }) => revision === currentDocument.revision)
    ) {
      revisions.push(
        toWikiDocumentRevisionSummary(
          toCurrentWikiDocumentRevision(currentDocument),
        ),
      );
    }

    return revisions.sort((left, right) => right.revision - left.revision);
  }

  async findDocumentRevision(
    organizationId: string,
    documentId: string,
    revision: number,
  ) {
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

    if (row) {
      return toWikiDocumentRevisionDomain(row);
    }

    const currentDocument = await this.findDocumentById(
      organizationId,
      documentId,
    );
    return currentDocument?.revision === revision
      ? toCurrentWikiDocumentRevision(currentDocument)
      : null;
  }

  async search(
    organizationId: string,
    query: string,
  ): Promise<WikiSearchMatch[]> {
    const normalizedQuery = query.trim();
    const pattern = toLikeContainsPattern(normalizedQuery);
    const documentNameMatched = sql<boolean>`${wikiEntry.name} ilike ${pattern}`;
    const documentContentMatched = sql<boolean>`${wikiDocument.contentMarkdown} ilike ${pattern}`;
    const [folders, documents] = await Promise.all([
      this.database.db
        .select({ entry: wikiEntry })
        .from(wikiEntry)
        .where(
          and(
            eq(wikiEntry.organizationId, organizationId),
            eq(wikiEntry.kind, 'folder'),
            ilike(wikiEntry.name, pattern),
          ),
        )
        .orderBy(asc(wikiEntry.name), asc(wikiEntry.id))
        .limit(wikiSearchResultLimit),
      this.database.db
        .select({
          entry: wikiEntry,
          document: wikiDocument,
          nameMatched: documentNameMatched,
          contentMatched: documentContentMatched,
        })
        .from(wikiEntry)
        .innerJoin(wikiDocument, eq(wikiDocument.id, wikiEntry.id))
        .where(
          and(
            eq(wikiEntry.organizationId, organizationId),
            eq(wikiEntry.kind, 'document'),
            or(documentNameMatched, documentContentMatched),
          ),
        )
        .orderBy(asc(wikiEntry.name), asc(wikiEntry.id))
        .limit(wikiSearchResultLimit),
    ]);

    const matches: WikiSearchMatch[] = [
      ...folders.map(({ entry }) => ({
        kind: 'folder' as const,
        id: entry.id,
        parentFolderId: entry.parentFolderId,
        name: entry.name,
        matchedIn: ['name' as const],
      })),
      ...documents.map(({ entry, nameMatched, contentMatched }) => {
        const matchedIn: Array<'name' | 'content'> = [];
        if (nameMatched) {
          matchedIn.push('name');
        }
        if (contentMatched) {
          matchedIn.push('content');
        }
        return {
          kind: 'document' as const,
          id: entry.id,
          parentFolderId: entry.parentFolderId,
          name: entry.name,
          matchedIn,
        };
      }),
    ];

    return matches
      .sort((left, right) =>
        left.name === right.name
          ? left.id.localeCompare(right.id)
          : left.name.localeCompare(right.name),
      )
      .slice(0, wikiSearchResultLimit);
  }

  private async findActiveEditLock(
    organizationId: string,
    documentId: string,
  ): Promise<WikiEditLock | null> {
    const [row] = await this.database.db
      .select()
      .from(wikiDocumentEditLock)
      .where(
        and(
          eq(wikiDocumentEditLock.organizationId, organizationId),
          eq(wikiDocumentEditLock.documentId, documentId),
          gt(wikiDocumentEditLock.expiresAt, databaseNow()),
        ),
      )
      .limit(1);

    return row ? toWikiEditLockDomain(row) : null;
  }
}

function toWikiDocumentSummary(
  document: ReturnType<typeof toWikiDocumentDomain>,
) {
  return {
    id: document.id,
    organizationId: document.organizationId,
    folderId: document.folderId,
    title: document.title,
    revision: document.revision,
    createdByUserId: document.createdByUserId,
    updatedByUserId: document.updatedByUserId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  } satisfies WikiDocumentSummary;
}

function toWikiDocumentRevisionSummary(
  revision: ReturnType<typeof toWikiDocumentRevisionDomain>,
): WikiDocumentRevisionSummary {
  return {
    documentId: revision.documentId,
    organizationId: revision.organizationId,
    revision: revision.revision,
    editorUserId: revision.editorUserId,
    createdAt: revision.createdAt,
  };
}

function toCurrentWikiDocumentRevision(
  document: WikiDocument,
): WikiDocumentRevision {
  const isInitialRevision = document.revision === 1;
  return {
    documentId: document.id,
    organizationId: document.organizationId,
    revision: document.revision,
    editorUserId: isInitialRevision
      ? document.createdByUserId
      : document.updatedByUserId,
    contentMarkdown: document.contentMarkdown,
    createdAt: isInitialRevision ? document.createdAt : document.updatedAt,
  };
}

function databaseNow() {
  return sql<Date>`clock_timestamp()`;
}

function editLockExpiry() {
  return sql<Date>`clock_timestamp() + (${WIKI_EDIT_LOCK_LEASE_SECONDS} * interval '1 second')`;
}

function toLikeContainsPattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, '\\$&');
  return `%${escaped}%`;
}

async function lockWikiHierarchy(
  transaction: WikiTransaction,
  organizationId: string,
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`wiki-hierarchy:${organizationId}`}, 0))`,
  );
}

async function assertFolderMoveAllowedInTransaction(
  transaction: WikiTransaction,
  input: {
    organizationId: string;
    folderId: string;
    targetParentFolderId: string | null;
  },
): Promise<void> {
  let currentFolderId = input.targetParentFolderId;
  const visited = new Set<string>();

  while (currentFolderId !== null) {
    if (currentFolderId === input.folderId || visited.has(currentFolderId)) {
      throw new WikiInvalidFolderMoveError();
    }
    visited.add(currentFolderId);

    const [folder] = await transaction
      .select({ parentFolderId: wikiEntry.parentFolderId })
      .from(wikiEntry)
      .where(
        and(
          eq(wikiEntry.organizationId, input.organizationId),
          eq(wikiEntry.id, currentFolderId),
          eq(wikiEntry.kind, 'folder'),
        ),
      )
      .limit(1)
      .for('update');

    if (!folder) {
      throw new WikiFolderNotFoundError();
    }
    currentFolderId = folder.parentFolderId;
  }
}

async function createConflictCopy(input: {
  transaction: WikiTransaction;
  entry: typeof wikiEntry.$inferSelect;
  organizationId: string;
  contentMarkdown: string;
  actorUserId: string;
}) {
  for (let attempt = 1; ; attempt += 1) {
    const [entry] = await input.transaction
      .insert(wikiEntry)
      .values(
        toWikiDocumentEntryInsert({
          organizationId: input.organizationId,
          folderId: input.entry.parentFolderId,
          title: buildWikiEntryNameCandidate(input.entry.name, attempt),
          actorUserId: input.actorUserId,
          position: input.entry.position,
        }),
      )
      .onConflictDoNothing({
        target: [
          wikiEntry.organizationId,
          wikiEntry.parentFolderId,
          wikiEntry.name,
        ],
      })
      .returning();

    if (!entry) {
      continue;
    }

    const [document] = await input.transaction
      .insert(wikiDocument)
      .values(
        toWikiDocumentInsert({
          id: entry.id,
          contentMarkdown: input.contentMarkdown,
          actorUserId: input.actorUserId,
        }),
      )
      .returning();

    if (!document) {
      throw new Error('위키 충돌 사본 생성 결과가 없습니다.');
    }

    await input.transaction.insert(wikiDocumentRevision).values(
      toWikiDocumentRevisionInsert({
        documentId: entry.id,
        organizationId: input.organizationId,
        revision: document.revision,
        editorUserId: input.actorUserId,
        contentMarkdown: document.contentMarkdown,
        createdAt: entry.updatedAt,
      }),
    );

    return toWikiDocumentDomain({ entry, document });
  }
}
