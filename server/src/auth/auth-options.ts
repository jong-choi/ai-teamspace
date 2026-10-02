import type { BetterAuthOptions } from 'better-auth';
import { organization, username } from 'better-auth/plugins';

export const authOptions = {
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    username({
      immutableUsername: true,
    }),
    organization(),
  ],
} as const satisfies BetterAuthOptions;
