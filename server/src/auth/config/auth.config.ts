import { registerAs } from '@nestjs/config';

import type { AuthConfig } from '@/auth/config/auth-config.type';
import { httpUrlSchema, trustedOriginsSchema } from '@/config/validation';
import validateConfig from '@/utils/validate-config';

import { z } from 'zod';

const authConfigSchema = z.object({
  APP_TRUSTED_ORIGINS: trustedOriginsSchema,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: httpUrlSchema,
});

export default registerAs<AuthConfig>('auth', () => {
  const environment = validateConfig(process.env, authConfigSchema);

  return {
    baseUrl: environment.BETTER_AUTH_URL,
    secret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: environment.APP_TRUSTED_ORIGINS,
  };
});
