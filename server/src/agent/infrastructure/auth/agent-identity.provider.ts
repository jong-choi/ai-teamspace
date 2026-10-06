import type { AgentActor } from '@/agent/domain/agent-actor';

export abstract class AgentIdentityProvider {
  abstract resolve(request: Request): Promise<AgentActor | null>;
}
