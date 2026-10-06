import { databaseUrlSchema } from '@/config/validation';
import type { DatabaseConfig } from '@/database/config/database-config.type';
import validateConfig from '@/utils/validate-config';

import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const databaseConfigSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
});

export default registerAs<DatabaseConfig>('database', () => {
  const environment = validateConfig(process.env, databaseConfigSchema);
  return { url: environment.DATABASE_URL };
});
