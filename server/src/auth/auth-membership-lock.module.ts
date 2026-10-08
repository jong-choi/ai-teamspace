import { Module } from '@nestjs/common';

import { AuthMembershipLockService } from '@/auth/auth-membership-lock.service';
import { MembershipLockPersistenceModule } from '@/auth/infrastructure/persistence/drizzle/membership-lock-persistence.module';
@Module({
  imports: [MembershipLockPersistenceModule],
  providers: [AuthMembershipLockService],
  exports: [AuthMembershipLockService],
})
export class AuthMembershipLockModule {}
