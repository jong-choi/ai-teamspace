import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { GraphCorrectionWriteBoundaryDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/graph-correction-write-boundary.repository';
import { GraphCorrectionWriteRepository } from '@/knowledge-graph/infrastructure/persistence/graph-correction-write.repository';
import { TeamspaceGraphSourceAccessModule } from '@/knowledge-graph/infrastructure/source-access/teamspace/teamspace-graph-source-access.module';

@Module({
  imports: [DatabaseModule, TeamspaceGraphSourceAccessModule],
  providers: [
    {
      provide: GraphCorrectionWriteRepository,
      useClass: GraphCorrectionWriteBoundaryDrizzleRepository,
    },
  ],
  exports: [GraphCorrectionWriteRepository],
})
export class GraphCorrectionCommandPersistenceModule {}
