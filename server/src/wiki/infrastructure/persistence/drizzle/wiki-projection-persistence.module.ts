import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { WikiProjectionSourceDrizzleRepository } from '@/wiki/infrastructure/persistence/drizzle/repositories/wiki-projection-source.repository';
import { WikiProjectionSourceRepository } from '@/wiki/infrastructure/persistence/wiki-projection-source.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: WikiProjectionSourceRepository,
      useClass: WikiProjectionSourceDrizzleRepository,
    },
  ],
  exports: [WikiProjectionSourceRepository],
})
export class WikiProjectionPersistenceModule {}
