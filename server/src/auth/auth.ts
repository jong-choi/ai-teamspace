import { authOptions } from '#server/auth/auth-options.js';
import * as authSchema from '#server/auth/infrastructure/persistence/drizzle/generated/auth.schema.js';
import { parseAuthEnvironment } from '#server/config/runtime-environment.js';
import type { DatabaseService } from '#server/database/database.service.js';

import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';

export function createAuth(database: DatabaseService['db']) {
  const { BETTER_AUTH_SECRET, BETTER_AUTH_URL } = parseAuthEnvironment();

  return betterAuth({
    ...authOptions,
    baseURL: BETTER_AUTH_URL,
    secret: BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: authSchema,
      transaction: true,
    }),
  });
}

export type Auth = ReturnType<typeof createAuth>;
