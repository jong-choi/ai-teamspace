import { Module } from '@nestjs/common';

import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { ObjectStorageModule } from '@/object-storage/object-storage.module';
import { BetterAuthUserAccountModule } from '@/user-profile/infrastructure/account/better-auth/better-auth-user-account.module';
import { UserProfileController } from '@/user-profile/user-profile.controller';
import { UserProfileService } from '@/user-profile/user-profile.service';

@Module({
  imports: [BetterAuthUserAccountModule, ObjectStorageModule],
  controllers: [UserProfileController],
  providers: [UserProfileService, TrustedOriginGuard],
})
export class UserProfileModule {}
