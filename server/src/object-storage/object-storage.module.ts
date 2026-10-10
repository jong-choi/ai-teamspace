import { Module } from '@nestjs/common';

import { S3ObjectStorageModule } from '@/object-storage/infrastructure/s3/s3-object-storage.module';

@Module({
  imports: [S3ObjectStorageModule],
  exports: [S3ObjectStorageModule],
})
export class ObjectStorageModule {}
