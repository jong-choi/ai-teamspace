import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { WikiProjectionSourceSchema } from '@/wiki/domain/wiki-projection-source';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';
import { WikiProjectionSourceRepository } from '@/wiki/infrastructure/persistence/wiki-projection-source.repository';

import { and, asc, eq, gt } from 'drizzle-orm';

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
}
