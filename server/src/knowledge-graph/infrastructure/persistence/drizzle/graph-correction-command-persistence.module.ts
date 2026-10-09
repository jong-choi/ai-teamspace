import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { GraphCorrectionWriteBoundaryDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/graph-correction-write-boundary.repository';
import { GraphCorrectionWriteRepository } from '@/knowledge-graph/infrastructure/persistence/graph-correction-write.repository';
import { WorkosGraphSourceAccessModule } from '@/knowledge-graph/infrastructure/source-access/workos/workos-graph-source-access.module';

@Module({
  imports: [DatabaseModule, WorkosGraphSourceAccessModule],
  providers: [
    {
      provide: GraphCorrectionWriteRepository,
      useClass: GraphCorrectionWriteBoundaryDrizzleRepository,
    },
  ],
  exports: [GraphCorrectionWriteRepository],
})
export class GraphCorrectionCommandPersistenceModule {}
