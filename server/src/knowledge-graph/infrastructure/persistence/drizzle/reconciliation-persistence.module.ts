import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { ReconciliationScopeDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/reconciliation-scope.repository';
import { ReconciliationScopeRepository } from '@/knowledge-graph/infrastructure/persistence/reconciliation-scope.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: ReconciliationScopeRepository,
      useClass: ReconciliationScopeDrizzleRepository,
    },
  ],
  exports: [ReconciliationScopeRepository],
})
export class ReconciliationPersistenceModule {}
