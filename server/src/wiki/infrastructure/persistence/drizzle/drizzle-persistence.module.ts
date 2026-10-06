import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { WikiDrizzleRepository } from '@/wiki/infrastructure/persistence/drizzle/repositories/wiki.repository';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';

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
