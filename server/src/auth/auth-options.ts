import { expo } from '@better-auth/expo';
import type { BetterAuthOptions } from 'better-auth';
import { organization, username } from 'better-auth/plugins';

export const organizationPlugin = organization();

export const organizationFacadeEndpoints = Object.values(
  organizationPlugin.endpoints,
);

export const organizationFacadeDisabledPaths = organizationFacadeEndpoints.map(
  (endpoint) => endpoint.path,
);

export const authOptions = {
  basePath: '/api/auth',
  trustedOrigins: ['monorepoerp://'],
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    expo(),
    username({
      immutableUsername: true,
    }),
    organizationPlugin,
  ],
} as const satisfies BetterAuthOptions;
