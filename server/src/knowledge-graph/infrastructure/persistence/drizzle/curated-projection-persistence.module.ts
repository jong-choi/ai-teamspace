import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { CuratedProjectionSourceRepository } from '@/knowledge-graph/infrastructure/persistence/curated-projection-source.repository';
import { CuratedProjectionSourceDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/curated-projection-source.repository';
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: CuratedProjectionSourceRepository,
      useClass: CuratedProjectionSourceDrizzleRepository,
    },
  ],
  exports: [CuratedProjectionSourceRepository],
})
export class CuratedProjectionPersistenceModule {}
