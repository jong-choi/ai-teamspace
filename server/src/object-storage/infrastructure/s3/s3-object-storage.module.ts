import { Module } from '@nestjs/common';

import { S3ObjectStorageAdapter } from '@/object-storage/infrastructure/s3/s3-object-storage.adapter';
import { ObjectStorageProvider } from '@/object-storage/object-storage.provider';

@Module({
  providers: [
    {
      provide: ObjectStorageProvider,
      useClass: S3ObjectStorageAdapter,
    },
  ],
  exports: [ObjectStorageProvider],
})
export class S3ObjectStorageModule {}
