import { Injectable } from '@nestjs/common';

import { DatabaseService } from '#server/database/database.service.js';
import type { WikiDocumentSummary } from '#server/wiki/domain/wiki-document.js';
import { buildWikiEntryNameCandidate } from '#server/wiki/domain/wiki-entry-name.js';
import {
  toWikiDocumentDomain,
  toWikiDocumentEntryInsert,
  toWikiDocumentEntryUpdate,
  toWikiDocumentInsert,
  toWikiDocumentUpdate,
} from '#server/wiki/infrastructure/persistence/drizzle/mappers/wiki-document.mapper.js';
import {
  toWikiFolderDomain,
  toWikiFolderInsert,
  toWikiFolderUpdate,
} from '#server/wiki/infrastructure/persistence/drizzle/mappers/wiki-folder.mapper.js';
import { isPostgresConstraintViolation } from '#server/wiki/infrastructure/persistence/drizzle/postgres-error.js';
import { wikiDocument } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema.js';
import { wikiEntry } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.schema.js';
import {
  type CreateWikiDocumentPersistenceInput,
  type CreateWikiFolderPersistenceInput,
  type DeleteWikiFolderResult,
  type UpdateWikiDocumentPersistenceInput,
  type UpdateWikiFolderPersistenceInput,
  WikiRepository,
  type WikiTree,
} from '#server/wiki/infrastructure/persistence/wiki.repository.js';

import { and, asc, eq } from 'drizzle-orm';

const wikiEntryNameConstraint = 'wiki_entry_organization_parent_name_unique';
const wikiEntryParentFolderConstraint =
  'wiki_entry_parent_folder_id_wiki_entry_id_fk';

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
    }
  }

  async updateFolder(input: UpdateWikiFolderPersistenceInput) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const [row] = await this.database.db
          .update(wikiEntry)
          .set(
            toWikiFolderUpdate({
              parentFolderId: input.parentFolderId,
              name: buildWikiEntryNameCandidate(input.name, attempt),
              position: input.position,
              updatedAt: new Date(),
            }),
          )
          .where(
            and(
              eq(wikiEntry.organizationId, input.organizationId),
              eq(wikiEntry.id, input.folderId),
              eq(wikiEntry.kind, 'folder'),
            ),
          )
          .returning();

        return row ? toWikiFolderDomain(row) : null;
      } catch (error) {
        if (
          isPostgresConstraintViolation(error, '23505', wikiEntryNameConstraint)
        ) {
          continue;
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
      const result = await this.database.db.transaction(async (transaction) => {
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

        return toWikiDocumentDomain({ entry, document });
      });

      if (result) {
        return result;
      }
    }
  }

  async updateDocument(input: UpdateWikiDocumentPersistenceInput) {
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

          if (!entry) {
            return null;
          }

          const contentChanged = input.contentMarkdown !== undefined;
          const [document] = await transaction
            .update(wikiDocument)
            .set(
              toWikiDocumentUpdate({
                ...(contentChanged
                  ? {
                      contentMarkdown: input.contentMarkdown,
                      revision: current.document.revision + 1,
                    }
                  : {}),
                actorUserId: input.actorUserId,
              }),
            )
            .where(eq(wikiDocument.id, input.documentId))
            .returning();

          if (!document) {
            throw new Error('위키 문서 수정 결과가 없습니다.');
          }

          return toWikiDocumentDomain({ entry, document });
        });
      } catch (error) {
        if (
          isPostgresConstraintViolation(error, '23505', wikiEntryNameConstraint)
        ) {
          continue;
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
