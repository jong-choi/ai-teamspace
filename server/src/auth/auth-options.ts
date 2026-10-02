import 'dotenv/config';

import type { BetterAuthOptions } from 'better-auth';
import { organization, username } from 'better-auth/plugins';

export const authOptions = {
  basePath: '/api/auth',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
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
