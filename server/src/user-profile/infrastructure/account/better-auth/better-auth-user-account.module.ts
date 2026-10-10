import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { BetterAuthUserAccountAdapter } from '@/user-profile/infrastructure/account/better-auth/better-auth-user-account.adapter';
import { UserAccountProvider } from '@/user-profile/infrastructure/account/user-account.provider';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: UserAccountProvider,
      useClass: BetterAuthUserAccountAdapter,
    },
  ],
  exports: [UserAccountProvider],
})
export class BetterAuthUserAccountModule {}
