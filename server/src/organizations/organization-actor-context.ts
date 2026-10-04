import type { IncomingHttpHeaders } from 'node:http';

import type { Auth } from '#server/auth/auth.js';
import type { OrganizationActorContext } from '#server/organizations/infrastructure/organization/organization.provider.js';

import type { UserSession } from '@thallesp/nestjs-better-auth';

export function toOrganizationActorContext(
  session: UserSession<Auth>,
  requestHeaders: IncomingHttpHeaders,
): OrganizationActorContext {
  return {
    userId: session.user.id,
    activeOrganizationIdCandidate:
      session.session.activeOrganizationId ?? undefined,
    providerCredential: requestHeaders,
  };
}
