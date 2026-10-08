import { Module } from '@nestjs/common';

import { WikiProjectionPersistenceModule } from '@/wiki/infrastructure/persistence/drizzle/wiki-projection-persistence.module';
import { WikiProjectionQueryService } from '@/wiki/wiki-projection-query.service';

@Module({
  imports: [WikiProjectionPersistenceModule],
  providers: [WikiProjectionQueryService],
  exports: [WikiProjectionQueryService],
})
export class WikiProjectionQueryModule {}
