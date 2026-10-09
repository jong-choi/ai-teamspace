import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { toLikeContainsPattern } from '@/utils/like-pattern';
import {
  WikiGraphSourceSchema,
  WikiKeywordCandidateSchema,
  WikiSemanticGraphSourceSchema,
} from '@/wiki/domain/wiki-graph-source';
import { WikiProjectionSourceSchema } from '@/wiki/domain/wiki-projection-source';
import { WikiSemanticSourceSchema } from '@/wiki/domain/wiki-semantic-source';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';
import { WikiProjectionSourceRepository } from '@/wiki/infrastructure/persistence/wiki-projection-source.repository';

import { and, asc, desc, eq, gt, ilike, inArray, or, sql } from 'drizzle-orm';

@Injectable()
export class WikiProjectionSourceDrizzleRepository extends WikiProjectionSourceRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async current(organizationId: string, documentId: string) {
    const [source] = await this.database.db
      .select({
        id: wikiDocument.id,
        organizationId: wikiDocument.organizationId,
        collectionId: wikiDocument.collectionId,
        parentDocumentId: wikiDocument.parentDocumentId,
        title: wikiDocument.title,
        position: wikiDocument.position,
        updatedAt: wikiDocument.updatedAt,
      })
      .from(wikiDocument)
      .where(
        and(
          eq(wikiDocument.organizationId, organizationId),
          eq(wikiDocument.id, documentId),
        ),
      )
      .limit(1);
    return source ? WikiProjectionSourceSchema.parse(source) : null;
  }
  async listIds(organizationId: string, afterId: string | null, limit: number) {
    return this.database.db
      .select({ id: wikiDocument.id })
      .from(wikiDocument)
      .where(
        and(
          eq(wikiDocument.organizationId, organizationId),
          afterId ? gt(wikiDocument.id, afterId) : undefined,
        ),
      )
      .orderBy(asc(wikiDocument.id))
      .limit(limit);
  }
  async currentSemantic(organizationId: string, documentId: string) {
    const [source] = await this.database.db
      .select({
        id: wikiDocument.id,
        organizationId: wikiDocument.organizationId,
        collectionId: wikiDocument.collectionId,
        parentDocumentId: wikiDocument.parentDocumentId,
        title: wikiDocument.title,
        position: wikiDocument.position,
        contentMarkdown: wikiDocument.contentMarkdown,
        updatedAt: wikiDocument.updatedAt,
      })
      .from(wikiDocument)
      .where(
        and(
          eq(wikiDocument.organizationId, organizationId),
          eq(wikiDocument.id, documentId),
        ),
      )
      .limit(1);
    return source ? WikiSemanticSourceSchema.parse(source) : null;
  }

  async currentManyForGraph(organizationId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const rows = await this.database.db
      .select({
        id: wikiDocument.id,
        title: wikiDocument.title,
        parentDocumentId: wikiDocument.parentDocumentId,
        position: wikiDocument.position,
        updatedAt: wikiDocument.updatedAt,
      })
      .from(wikiDocument)
      .where(
        and(
          eq(wikiDocument.organizationId, organizationId),
          inArray(wikiDocument.id, [...ids].slice(0, 100)),
        ),
      );
    return WikiGraphSourceSchema.array().parse(rows);
  }

  async currentSemanticMany(organizationId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const rows = await this.database.db
      .select({
        id: wikiDocument.id,
        organizationId: wikiDocument.organizationId,
        collectionId: wikiDocument.collectionId,
        parentDocumentId: wikiDocument.parentDocumentId,
        title: wikiDocument.title,
        position: wikiDocument.position,
        contentMarkdown: wikiDocument.contentMarkdown,
        updatedAt: wikiDocument.updatedAt,
      })
      .from(wikiDocument)
      .where(
        and(
          eq(wikiDocument.organizationId, organizationId),
          inArray(wikiDocument.id, [...ids].slice(0, 100)),
        ),
      );
    return WikiSemanticGraphSourceSchema.array().parse(rows);
  }

  async keywordCandidates(
    organizationId: string,
    query: string,
    limit: number,
  ) {
    const pattern = toLikeContainsPattern(query.trim());
    const titleMatched = ilike(wikiDocument.title, pattern);
    const contentMatched = ilike(wikiDocument.contentMarkdown, pattern);
    const rows = await this.database.db
      .select({
        id: wikiDocument.id,
        title: wikiDocument.title,
        updatedAt: wikiDocument.updatedAt,
        titleMatched: sql<boolean>`${titleMatched}`.mapWith(Boolean),
        contentMatched: sql<boolean>`${contentMatched}`.mapWith(Boolean),
      })
      .from(wikiDocument)
      .where(
        and(
          eq(wikiDocument.organizationId, organizationId),
          or(titleMatched, contentMatched),
        ),
      )
      .orderBy(
        desc(sql<number>`case when ${titleMatched} then 1 else 0 end`),
        desc(wikiDocument.updatedAt),
        asc(wikiDocument.id),
      )
      .limit(Math.min(limit, 50));
    return WikiKeywordCandidateSchema.array().parse(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updatedAt,
        matchedIn: [
          ...(row.titleMatched ? (['title'] as const) : []),
          ...(row.contentMatched ? (['content'] as const) : []),
        ],
      })),
    );
  }

  async listForGraph(
    organizationId: string,
    query: Parameters<WikiProjectionSourceRepository['listForGraph']>[1],
  ) {
    const pattern = query.q ? toLikeContainsPattern(query.q) : null;
    const rows = await this.database.db
      .select({
        id: wikiDocument.id,
        title: wikiDocument.title,
        parentDocumentId: wikiDocument.parentDocumentId,
        position: wikiDocument.position,
        updatedAt: wikiDocument.updatedAt,
      })
      .from(wikiDocument)
      .where(
        and(
          eq(wikiDocument.organizationId, organizationId),
          pattern ? ilike(wikiDocument.title, pattern) : undefined,
          query.after
            ? or(
                gt(wikiDocument.title, query.after.title),
                and(
                  eq(wikiDocument.title, query.after.title),
                  gt(wikiDocument.id, query.after.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(wikiDocument.title), asc(wikiDocument.id))
      .limit(query.limit);
    return WikiGraphSourceSchema.array().parse(rows);
  }
}
