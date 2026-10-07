import type { AgentActor } from '@/agent/domain/agent-actor';

import type {
  AuthProvider,
  OAuthClientProvider,
} from '@modelcontextprotocol/client';

/** Work OS MCP transport에 actor별 인증 provider를 제공한다. */
export abstract class WorkOsMcpAuthProviderFactory {
  abstract create(
    actor: AgentActor,
  ):
    | AuthProvider
    | OAuthClientProvider
    | Promise<AuthProvider | OAuthClientProvider>;
}
