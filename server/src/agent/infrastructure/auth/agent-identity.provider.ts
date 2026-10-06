import type { AgentActor } from '#server/agent/domain/agent-actor.js';

export abstract class AgentIdentityProvider {
  abstract resolve(request: Request): Promise<AgentActor | null>;
}
