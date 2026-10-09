import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { SemanticCorrectionDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/semantic-correction.repository';
import { SemanticCorrectionRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-correction.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: SemanticCorrectionRepository,
      useClass: SemanticCorrectionDrizzleRepository,
    },
  ],
  exports: [SemanticCorrectionRepository],
})
export class SemanticCorrectionPersistenceModule {}
