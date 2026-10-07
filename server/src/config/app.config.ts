import { registerAs } from '@nestjs/config';

import type { AppConfig } from '@/config/app-config.type';
import { trustedOriginsSchema } from '@/config/validation';
import validateConfig from '@/utils/validate-config';

import { z } from 'zod';

const appConfigSchema = z.object({
  APP_TRUSTED_ORIGINS: trustedOriginsSchema,
  PORT: z.coerce.number().int().min(1).max(65_535),
});

export default registerAs<AppConfig>('app', () => {
  const environment = validateConfig(process.env, appConfigSchema);

  return {
    port: environment.PORT,
    corsOrigins: environment.APP_TRUSTED_ORIGINS.filter((origin) =>
      /^https?:\/\//.test(origin),
    ),
  };
});
