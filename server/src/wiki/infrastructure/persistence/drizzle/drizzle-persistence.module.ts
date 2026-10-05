import { Module } from '@nestjs/common';

import { DatabaseModule } from '#server/database/database.module.js';
import { WikiDrizzleRepository } from '#server/wiki/infrastructure/persistence/drizzle/repositories/wiki.repository.js';
import { WikiRepository } from '#server/wiki/infrastructure/persistence/wiki.repository.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: WikiRepository,
      useClass: WikiDrizzleRepository,
    },
  ],
  exports: [WikiRepository],
})
export class WikiDrizzlePersistenceModule {}
