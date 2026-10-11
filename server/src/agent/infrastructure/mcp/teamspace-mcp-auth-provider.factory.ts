import type { AgentActor } from '@/agent/domain/agent-actor';

import type {
  AuthProvider,
  OAuthClientProvider,
} from '@modelcontextprotocol/client';

/** AI Teamspace MCP transport에 actor별 인증 provider를 제공한다. */
export abstract class TeamspaceMcpAuthProviderFactory {
  abstract create(
    actor: AgentActor,
  ):
    | AuthProvider
    | OAuthClientProvider
    | Promise<AuthProvider | OAuthClientProvider>;
}
