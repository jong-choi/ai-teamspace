import {
  authOptions,
  organizationFacadeDisabledPaths,
} from '@/auth/auth-options';
import * as authSchema from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { protectOrganizationOwners } from '@/auth/infrastructure/persistence/drizzle/owner-protected.adapter';
import { problemDetailsPlugin } from '@/auth/plugins/problem-details.plugin';
import { parseAuthEnvironment } from '@/config/runtime-environment';
import type { DatabaseService } from '@/database/database.service';

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
