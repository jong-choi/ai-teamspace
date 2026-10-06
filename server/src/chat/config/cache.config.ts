import { redisUrlSchema } from '@/config/validation';
import type { CacheConfig } from '@/chat/config/cache-config.type';
import validateConfig from '@/utils/validate-config';

import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const cacheConfigSchema = z.object({
  REDIS_CACHE_URL: redisUrlSchema,
});

export default registerAs<CacheConfig>('cache', () => {
  const environment = validateConfig(process.env, cacheConfigSchema);
  return { redisUrl: environment.REDIS_CACHE_URL };
});
