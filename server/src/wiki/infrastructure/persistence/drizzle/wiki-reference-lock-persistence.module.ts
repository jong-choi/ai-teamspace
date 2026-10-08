import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { WikiReferenceLockDrizzleRepository } from '@/wiki/infrastructure/persistence/drizzle/repositories/wiki-reference-lock.repository';
import { WikiReferenceLockRepository } from '@/wiki/infrastructure/persistence/wiki-reference-lock.repository';
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: WikiReferenceLockRepository,
      useClass: WikiReferenceLockDrizzleRepository,
    },
  ],
  exports: [WikiReferenceLockRepository],
})
export class WikiReferenceLockPersistenceModule {}
