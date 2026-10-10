import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { S3ObjectStorageModule } from '@/object-storage/infrastructure/s3/s3-object-storage.module';
import { UserProfileController } from '@/user-profile/user-profile.controller';
import { UserProfileService } from '@/user-profile/user-profile.service';

@Module({
  imports: [AuthModule, S3ObjectStorageModule],
  controllers: [UserProfileController],
  providers: [UserProfileService, TrustedOriginGuard],
})
export class UserProfileModule {}
