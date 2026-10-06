import {
  authOptions,
  organizationFacadeDisabledPaths,
} from '@/auth/auth-options';
import type { AuthConfig } from '@/auth/config/auth-config.type';
import * as authSchema from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { protectOrganizationOwners } from '@/auth/infrastructure/persistence/drizzle/owner-protected.adapter';
import { problemDetailsPlugin } from '@/auth/plugins/problem-details.plugin';
import type { DatabaseService } from '@/database/database.service';

import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { BetterAuthOptions } from 'better-auth';
import { betterAuth } from 'better-auth';

export function createAuth(
  database: DatabaseService['db'],
  config: AuthConfig,
) {
  return betterAuth({
    ...authOptions,
    baseURL: config.baseUrl,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
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
