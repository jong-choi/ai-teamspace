import { Injectable } from '@nestjs/common';

import type { AgentActor } from '#server/agent/domain/agent-actor.js';
import { AgentIdentityProvider } from '#server/agent/infrastructure/auth/agent-identity.provider.js';
import type { Auth } from '#server/auth/auth.js';

import { AuthService } from '@thallesp/nestjs-better-auth';

@Injectable()
export class BetterAuthAgentIdentityAdapter extends AgentIdentityProvider {
  constructor(private readonly authService: AuthService<Auth>) {
    super();
  }

  async resolve(request: Request): Promise<AgentActor | null> {
    const session = await this.authService.api.getSession({
      headers: request.headers,
    });
    if (!session) return null;

    return {
      userId: session.user.id,
      displayName: session.user.name,
      permissions: [],
    };
  }
}
