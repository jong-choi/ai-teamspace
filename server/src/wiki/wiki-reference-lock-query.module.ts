import { Module } from '@nestjs/common';

import { WikiReferenceLockPersistenceModule } from '@/wiki/infrastructure/persistence/drizzle/wiki-reference-lock-persistence.module';
import { WikiReferenceLockQueryService } from '@/wiki/wiki-reference-lock-query.service';
@Module({
  imports: [WikiReferenceLockPersistenceModule],
  providers: [WikiReferenceLockQueryService],
  exports: [WikiReferenceLockQueryService],
})
export class WikiReferenceLockQueryModule {}
