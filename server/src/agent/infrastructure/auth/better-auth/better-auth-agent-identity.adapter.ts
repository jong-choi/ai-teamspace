import { Injectable } from '@nestjs/common';

import type { AgentActor } from '@/agent/domain/agent-actor';
import { AgentIdentityProvider } from '@/agent/infrastructure/auth/agent-identity.provider';
import type { Auth } from '@/auth/auth';

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
