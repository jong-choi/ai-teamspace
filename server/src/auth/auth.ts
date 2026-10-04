import {
  authOptions,
  organizationFacadeDisabledPaths,
} from '#server/auth/auth-options.js';
import * as authSchema from '#server/auth/infrastructure/persistence/drizzle/generated/auth.schema.js';
import { protectOrganizationOwners } from '#server/auth/infrastructure/persistence/drizzle/owner-protected.adapter.js';
import { problemDetailsPlugin } from '#server/auth/plugins/problem-details.plugin.js';
import { parseAuthEnvironment } from '#server/config/runtime-environment.js';
import type { DatabaseService } from '#server/database/database.service.js';

import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { BetterAuthOptions } from 'better-auth';
import { betterAuth } from 'better-auth';

export function createAuth(database: DatabaseService['db']) {
  const { BETTER_AUTH_SECRET, BETTER_AUTH_URL } = parseAuthEnvironment();

  return betterAuth({
    ...authOptions,
    baseURL: BETTER_AUTH_URL,
    secret: BETTER_AUTH_SECRET,
    plugins: [
      ...authOptions.plugins,
      problemDetailsPlugin({
        disabledPaths: organizationFacadeDisabledPaths,
      }),
    ],
    database: (options: BetterAuthOptions) =>
      protectOrganizationOwners(
        drizzleAdapter(database, {
          provider: 'pg',
          schema: authSchema,
          transaction: true,
        })(options),
      ),
  });
}

export type Auth = ReturnType<typeof createAuth>;
