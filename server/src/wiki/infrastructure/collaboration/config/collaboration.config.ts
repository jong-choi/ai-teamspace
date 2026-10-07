import { registerAs } from '@nestjs/config';

import { redisUrlSchema, webSocketUrlSchema } from '@/config/validation';
import validateConfig from '@/utils/validate-config';
import type { CollaborationConfig } from '@/wiki/infrastructure/collaboration/config/collaboration-config.type';

import { z } from 'zod';

const collaborationConfigSchema = z.object({
  COLLABORATION_PORT: z.coerce.number().int().min(1).max(65_535),
  COLLABORATION_PUBLIC_URL: webSocketUrlSchema,
  COLLABORATION_JWT_SECRET: z.string().min(32),
  REDIS_COLLABORATION_URL: redisUrlSchema,
});

export default registerAs<CollaborationConfig>('collaboration', () => {
  const environment = validateConfig(process.env, collaborationConfigSchema);

  return {
    port: environment.COLLABORATION_PORT,
    publicUrl: environment.COLLABORATION_PUBLIC_URL,
    jwtSecret: environment.COLLABORATION_JWT_SECRET,
    redisUrl: environment.REDIS_COLLABORATION_URL,
  };
});
