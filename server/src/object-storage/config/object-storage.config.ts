import { registerAs } from '@nestjs/config';

import type { ObjectStorageConfig } from '@/object-storage/config/object-storage-config.type';
import validateConfig from '@/utils/validate-config';

import { z } from 'zod';

const objectStorageConfigSchema = z.object({
  OBJECT_STORAGE_ENDPOINT: z.url(),
  OBJECT_STORAGE_REGION: z.string().trim().min(1),
  OBJECT_STORAGE_BUCKET: z.string().trim().min(1),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().trim().min(1),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().trim().min(1),
});

export default registerAs<ObjectStorageConfig>('objectStorage', () => {
  const environment = validateConfig(process.env, objectStorageConfigSchema);

  return {
    accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY_ID,
    bucket: environment.OBJECT_STORAGE_BUCKET,
    endpoint: environment.OBJECT_STORAGE_ENDPOINT,
    region: environment.OBJECT_STORAGE_REGION,
    secretAccessKey: environment.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  };
});
