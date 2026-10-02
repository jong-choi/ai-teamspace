import { authOptions } from '#server/auth/auth-options.js';
import * as authSchema from '#server/auth/infrastructure/persistence/drizzle/generated/auth.schema.js';
import { database } from '#server/database/database.js';

import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';

export const auth = betterAuth({
  ...authOptions,
  database: drizzleAdapter(database, {
    provider: 'pg',
    schema: authSchema,
    transaction: true,
  }),
});
