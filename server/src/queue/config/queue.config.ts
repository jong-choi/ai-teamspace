import { registerAs } from '@nestjs/config';

import { redisUrlSchema } from '@/config/validation';
import type { QueueConfig } from '@/queue/config/queue-config.type';
import validateConfig from '@/utils/validate-config';

import { z } from 'zod';

const queueConfigSchema = z.object({
  BULLMQ_PREFIX: z.string().trim().min(1),
  REDIS_QUEUE_URL: redisUrlSchema,
});

export default registerAs<QueueConfig>('queue', () => {
  const environment = validateConfig(process.env, queueConfigSchema);
  return {
    prefix: environment.BULLMQ_PREFIX,
    redisUrl: environment.REDIS_QUEUE_URL,
  };
});
