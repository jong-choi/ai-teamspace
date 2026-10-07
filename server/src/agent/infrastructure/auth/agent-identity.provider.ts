import type { AgentActor } from '@/agent/domain/agent-actor';

export class AgentOrganizationContextRequiredError extends Error {
  constructor() {
    super('Agent를 사용하려면 접근 가능한 활성 조직이 필요합니다.');
    this.name = 'AgentOrganizationContextRequiredError';
  }
}

export abstract class AgentIdentityProvider {
  abstract resolve(request: Request): Promise<AgentActor | null>;
}
