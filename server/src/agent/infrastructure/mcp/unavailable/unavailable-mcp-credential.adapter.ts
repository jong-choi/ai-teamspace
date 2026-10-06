import { Injectable } from '@nestjs/common';

import type { AgentActor } from '#server/agent/domain/agent-actor.js';
import { McpCredentialProvider } from '#server/agent/infrastructure/mcp/mcp-credential.provider.js';

/** 실제 사용자 delegation provider가 연결되기 전에는 Agent 실행을 fail-closed로 막는다. */
@Injectable()
export class UnavailableMcpCredentialAdapter extends McpCredentialProvider {
  getCredential(actor: AgentActor): never {
    void actor;
    throw new Error(
      'WorkOS MCP delegation credential provider가 구성되지 않았습니다.',
    );
  }
}
