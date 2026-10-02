import { authOptions } from '#server-source/auth/auth-options';

import { betterAuth } from 'better-auth';

export const auth = betterAuth(authOptions);
