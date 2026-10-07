import {
  createAuthOptions,
  mcpAccessKeyFacadeDisabledPaths,
  organizationFacadeDisabledPaths,
} from '@/auth/auth-options';
import type { AuthConfig } from '@/auth/config/auth-config.type';
import * as authSchema from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { protectOrganizationOwners } from '@/auth/infrastructure/persistence/drizzle/owner-protected.adapter';
import { problemDetailsPlugin } from '@/auth/plugins/problem-details.plugin';
import type { DatabaseService } from '@/database/database.service';
import type { McpConfig } from '@/mcp/config/mcp-config.type';

import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { BetterAuthOptions } from 'better-auth';
import { betterAuth } from 'better-auth';

export function createAuth(
  database: DatabaseService['db'],
  config: AuthConfig,
  mcpConfig: McpConfig,
) {
  const options = createAuthOptions(mcpConfig);

  return betterAuth({
    ...options,
    baseURL: config.baseUrl,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    plugins: [
      ...options.plugins,
      problemDetailsPlugin({
        disabledPaths: [
          ...organizationFacadeDisabledPaths,
          ...mcpAccessKeyFacadeDisabledPaths,
        ],
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
