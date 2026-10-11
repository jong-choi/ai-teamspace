import { Injectable } from '@nestjs/common';

import { McpAuthContextSchema } from '@/mcp/contracts/mcp-auth-context';
import { TEAMSPACE_MCP_PROTOCOL_VERSION } from '@/mcp/contracts/mcp-protocol';
import { TeamspaceMcpServerFactory } from '@/mcp/mcp-server.factory';
import { McpAccessService } from '@/mcp-access/mcp-access.service';

import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';

export type McpFirstPartyActor = {
  userId: string;
  organizationId: string;
};

export type McpFirstPartyConnection = {
  client: Client;
  close(): Promise<void>;
};

// 요청은 아래 fetch에서 프로세스 내부 handler로 바로 전달되어 네트워크로 나가지 않는다.
// 예약 TLD(.invalid)를 써서 실수로 외부 요청이 되더라도 해석되지 않게 한다.
const FIRST_PARTY_ENDPOINT = new URL('http://work-os-first-party.invalid/mcp');

const FIRST_PARTY_CLIENT_INFO = {
  name: 'work-os-first-party-agent',
  version: '0.0.1',
} as const;

/**
 * 서버가 검증한 actor로 AI Teamspace MCP 서버에 프로세스 내부 연결을 연다.
 * OAuth credential 대신 현재 조직 정책·사용자 정책·멤버십을 기준으로 동작하며,
 * 도구 호출 시점의 권한 검사는 기존 MCP tool 인가 흐름이 그대로 수행한다.
 */
@Injectable()
export class McpFirstPartyConnectionService {
  constructor(
    private readonly servers: TeamspaceMcpServerFactory,
    private readonly access: McpAccessService,
  ) {}

  async connect(actor: McpFirstPartyActor): Promise<McpFirstPartyConnection> {
    const scopes = await this.access.resolveFirstPartyAgentScopes(
      actor.organizationId,
      actor.userId,
    );
    const auth = McpAuthContextSchema.parse({
      authMethod: 'first-party-agent',
      credentialId: null,
      userId: actor.userId,
      clientId: null,
      scopes,
      allowedOrganizationIds: [actor.organizationId],
    });

    // HTTP endpoint와 같은 modern handler를 사용해 도구 결과 형태를 외부 MCP 경로와 일치시킨다.
    const handler = createMcpHandler(
      () => this.servers.createForAuthContext(auth),
      { legacy: 'reject' },
    );
    const transport = new StreamableHTTPClientTransport(FIRST_PARTY_ENDPOINT, {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    });
    const client = new Client(FIRST_PARTY_CLIENT_INFO, {
      versionNegotiation: { mode: { pin: TEAMSPACE_MCP_PROTOCOL_VERSION } },
    });

    let closePromise: Promise<void> | undefined;
    const close = (): Promise<void> => {
      closePromise ??= Promise.allSettled([
        client.close(),
        transport.close(),
        handler.close(),
      ]).then(() => undefined);
      return closePromise;
    };

    try {
      await client.connect(transport);
    } catch (error) {
      await close();
      throw error;
    }

    return { client, close };
  }
}
