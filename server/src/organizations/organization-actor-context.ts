import type { IncomingHttpHeaders } from 'node:http';

import type { Auth } from '@/auth/auth';

import type { UserSession } from '@thallesp/nestjs-better-auth';

export interface OrganizationActorContext {
  userId: string;
  activeOrganizationIdCandidate?: string;
}

export function toOrganizationActorContext(
  session: UserSession<Auth>,
  _legacyRequestHeaders?: IncomingHttpHeaders,
): OrganizationActorContext {
  return {
    userId: session.user.id,
    activeOrganizationIdCandidate:
      session.session.activeOrganizationId ?? undefined,
  };
}
