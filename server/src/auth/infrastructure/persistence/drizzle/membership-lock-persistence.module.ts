import { Module } from '@nestjs/common';

import { MembershipLockDrizzleRepository } from '@/auth/infrastructure/persistence/drizzle/repositories/membership-lock.repository';
import { MembershipLockRepository } from '@/auth/infrastructure/persistence/membership-lock.repository';
import { DatabaseModule } from '@/database/database.module';
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: MembershipLockRepository,
      useClass: MembershipLockDrizzleRepository,
    },
  ],
  exports: [MembershipLockRepository],
})
export class MembershipLockPersistenceModule {}
