import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { RequestQuotaDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/request-quota.repository';
import { RequestQuotaRepository } from '@/knowledge-graph/infrastructure/persistence/request-quota.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: RequestQuotaRepository,
      useClass: RequestQuotaDrizzleRepository,
    },
  ],
  exports: [RequestQuotaRepository],
})
export class RequestQuotaPersistenceModule {}
