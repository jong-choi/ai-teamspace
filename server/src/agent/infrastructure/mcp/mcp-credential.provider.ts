import type { AgentActor } from '#server/agent/domain/agent-actor.js';

/** MCP 인증 구현이 제공해야 하는 최소 credential surface다. */
export interface McpCredential {
  readonly token: () => Promise<string>;
  readonly onUnauthorized?: () => Promise<void>;
}

export abstract class McpCredentialProvider {
  abstract getCredential(
    actor: AgentActor,
  ): McpCredential | Promise<McpCredential>;
}
