import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { GraphCorrectionWriteRepository } from '@/knowledge-graph/infrastructure/persistence/graph-correction-write.repository';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';

@Injectable()
export class GraphCorrectionWriteBoundaryDrizzleRepository extends GraphCorrectionWriteRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: GraphSourceAccessProvider,
  ) {
    super();
  }

  runLockedWiki<T>(
    organizationId: string,
    actorUserId: string,
    documentId: string,
    operation: () => Promise<T>,
  ) {
    return this.database.runInTransaction(async () => {
      const locked = await this.access.lockWikiWriter(
        organizationId,
        actorUserId,
        documentId,
      );
      if (
        locked === 'not_member' ||
        locked === 'not_found' ||
        locked === 'forbidden'
      ) {
        return { outcome: 'not_found' as const };
      }
      return { outcome: 'locked' as const, value: await operation() };
    });
  }
}
