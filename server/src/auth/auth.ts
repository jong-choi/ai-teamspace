import { authOptions } from '#server/auth/auth-options.js';
import * as authSchema from '#server/auth/infrastructure/persistence/drizzle/generated/auth.schema.js';
import { protectOrganizationOwners } from '#server/auth/infrastructure/persistence/drizzle/owner-protected.adapter.js';
import {
  problemDetailsPlugin,
  toAuthProblemResponse,
} from '#server/auth/plugins/problem-details.plugin.js';
import { parseAuthEnvironment } from '#server/config/runtime-environment.js';
import type { DatabaseService } from '#server/database/database.service.js';

import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { ProblemDetailsFactory } from '@camcima/nestjs-rfc9457';
import type { BetterAuthOptions } from 'better-auth';
import { betterAuth } from 'better-auth';

export function createAuth(
  database: DatabaseService['db'],
  problems: ProblemDetailsFactory,
) {
  const { BETTER_AUTH_SECRET, BETTER_AUTH_URL } = parseAuthEnvironment();

  const auth = betterAuth({
    ...authOptions,
    baseURL: BETTER_AUTH_URL,
    secret: BETTER_AUTH_SECRET,
    plugins: [...authOptions.plugins, problemDetailsPlugin(problems)],
    database: (options: BetterAuthOptions) =>
      protectOrganizationOwners(
        drizzleAdapter(database, {
          provider: 'pg',
          schema: authSchema,
          transaction: true,
        })(options),
      ),
  });
  return {
    ...auth,
    // disabledPaths와 router의 조기 반환은 플러그인 응답 훅 밖에서 발생한다.
    handler: async (request: Request) =>
      toAuthProblemResponse(problems, await auth.handler(request), request),
  };
}

export type Auth = ReturnType<typeof createAuth>;
