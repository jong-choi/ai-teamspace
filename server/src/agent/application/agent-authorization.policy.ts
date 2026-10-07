import { Injectable } from '@nestjs/common';

import { AgentAuth, AgentHttpException } from '@repo/agent-runtime';
import {
  AgentIdentityProvider,
  AgentOrganizationContextRequiredError,
} from '@/agent/infrastructure/auth/agent-identity.provider';

@Injectable()
export class AgentAuthorizationPolicy {
  constructor(private readonly identities: AgentIdentityProvider) {}

  create(): AgentAuth {
    return new AgentAuth()
      .authenticate(async (request) => {
        let actor;
        try {
          actor = await this.identities.resolve(request);
        } catch (error) {
          if (error instanceof AgentOrganizationContextRequiredError) {
            throw new AgentHttpException(403, { message: error.message });
          }
          throw error;
        }
        if (!actor) {
          throw new AgentHttpException(401, {
            message: '인증이 필요합니다.',
          });
        }

        return {
          identity: actor.userId,
          display_name: actor.displayName,
          permissions: actor.permissions,
          organization_id: actor.organizationId,
        };
      })
      .on('threads', ({ user }) => ({
        owner_user_id: user.identity,
        organization_id: requireOrganizationId(user),
      }))
      .on(
        'assistants',
        ({ action }) => action === 'read' || action === 'search',
      )
      .on('store', ({ user, value }) => {
        value.namespace = [
          tenantNamespace(user.identity, requireOrganizationId(user)),
          ...(value.namespace ?? []).slice(1),
        ];
      });
  }
}

function requireOrganizationId(user: { organization_id?: unknown }): string {
  const organizationId = user.organization_id;
  if (typeof organizationId !== 'string' || organizationId.length === 0) {
    throw new AgentHttpException(403, {
      message: '검증된 Agent 조직 context가 없습니다.',
    });
  }
  return organizationId;
}

function tenantNamespace(identity: string, organizationId: string): string {
  return encodeURIComponent(`${organizationId}:${identity}`)
    .replace(/\./g, '%2E')
    .replace(/\*/g, '%2A');
}
