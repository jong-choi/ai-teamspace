import { Injectable } from '@nestjs/common';

import { AgentAuth, AgentHttpException } from '@repo/agent-runtime';
import { AgentIdentityProvider } from '#server/agent/infrastructure/auth/agent-identity.provider.js';

@Injectable()
export class AgentAuthorizationPolicy {
  constructor(private readonly identities: AgentIdentityProvider) {}

  create(): AgentAuth {
    return new AgentAuth()
      .authenticate(async (request) => {
        const actor = await this.identities.resolve(request);
        if (!actor) {
          throw new AgentHttpException(401, {
            message: '인증이 필요합니다.',
          });
        }

        return {
          identity: actor.userId,
          display_name: actor.displayName,
          permissions: actor.permissions,
        };
      })
      .on('threads', ({ user }) => ({
        owner_user_id: user.identity,
      }))
      .on(
        'assistants',
        ({ action }) => action === 'read' || action === 'search',
      )
      .on('store', ({ user, value }) => {
        value.namespace = [
          tenantNamespace(user.identity),
          ...(value.namespace ?? []).slice(1),
        ];
      });
  }
}

function tenantNamespace(identity: string): string {
  return encodeURIComponent(identity)
    .replace(/\./g, '%2E')
    .replace(/\*/g, '%2A');
}
