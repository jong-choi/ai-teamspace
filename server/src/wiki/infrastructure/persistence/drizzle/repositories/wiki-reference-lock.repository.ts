import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';
import { WikiReferenceLockRepository } from '@/wiki/infrastructure/persistence/wiki-reference-lock.repository';

import { and, eq } from 'drizzle-orm';
@Injectable()
export class WikiReferenceLockDrizzleRepository extends WikiReferenceLockRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }
  async lockDocument(organizationId: string, id: string) {
    return (await this.lockDocumentVersion(organizationId, id)) !== null;
  }
  async lockDocumentVersion(organizationId: string, id: string) {
    const [row] = await this.database
      .requireTransaction()
      .select({ updatedAt: wikiDocument.updatedAt })
      .from(wikiDocument)
      .where(
        and(
          eq(wikiDocument.organizationId, organizationId),
          eq(wikiDocument.id, id),
        ),
      )
      .for('share');
    return row ?? null;
  }
}
