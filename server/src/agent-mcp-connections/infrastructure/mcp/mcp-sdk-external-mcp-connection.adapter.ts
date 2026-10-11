import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AgentActor } from '@/agent/domain/agent-actor';
import type { TeamspaceToolSession } from '@/agent/infrastructure/mcp/teamspace-tool-session.provider';
import { AgentMcpCredentialService } from '@/agent-mcp-connections/application/agent-mcp-credential.service';
import { AgentMcpOauthService } from '@/agent-mcp-connections/application/agent-mcp-oauth.service';
import { ExternalMcpToolPolicy } from '@/agent-mcp-connections/application/external-mcp-tool.policy';
import type { AgentMcpConnection } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import { SafeOutboundHttp } from '@/agent-mcp-connections/infrastructure/http/safe-outbound-http';
import { ExternalMcpConnectionSessionProvider } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-connection-session.provider';
import {
  type ExternalMcpDiscovery,
  ExternalMcpDiscoveryProvider,
} from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-discovery.provider';
import { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { AllConfigType } from '@/config/config.type';

import { loadMcpTools } from '@langchain/mcp-adapters';
import {
  type AuthProvider,
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

@Injectable()
export class McpSdkExternalMcpConnectionAdapter
  extends ExternalMcpConnectionSessionProvider
  implements ExternalMcpDiscoveryProvider
{
  constructor(
    private readonly repository: AgentMcpConnectionRepository,
    private readonly credentials: AgentMcpCredentialService,
    private readonly oauth: AgentMcpOauthService,
    private readonly safeOutbound: SafeOutboundHttp,
    private readonly toolPolicy: ExternalMcpToolPolicy,
    private readonly configService: ConfigService<AllConfigType>,
  ) {
    super();
  }

  async open(
    actor: AgentActor,
    connection: AgentMcpConnection,
  ): Promise<TeamspaceToolSession> {
    const { client, close, config } = await this.connectClient(
      actor,
      connection,
    );

    try {
      const discoveredTools = await loadMcpTools(connection.namespace, client, {
        prefixToolNameWithServerName: false,
        defaultToolTimeout: config.toolTimeoutMs,
        elicitation: false,
        afterToolCall: ({ result }) => {
          this.assertResultSize(result, config.maxResponseBytes);
        },
      });
      const selectedTools =
        connection.toolPolicyMode === 'selected'
          ? await this.repository.listEnabledTools(connection.id)
          : [];
      const selection = this.toolPolicy.selectTools(
        connection,
        discoveredTools,
        selectedTools,
        config.maxToolsPerConnection,
      );

      return {
        tools: selection.tools,
        readOnlyTools: [],
        interruptOn: Object.fromEntries(
          selection.tools.map((tool) => [tool.name, true] as const),
        ),
        toolIdentities: selection.toolIdentities,
        close,
      };
    } catch (error) {
      await close().catch(() => undefined);
      throw error;
    }
  }

  discover(
    actor: AgentActor,
    connection: AgentMcpConnection,
  ): Promise<ExternalMcpDiscovery> {
    return this.discoverWithAuthProvider(actor, connection);
  }

  discoverWithBearerToken(
    actor: AgentActor,
    connection: AgentMcpConnection,
    bearerToken: string,
  ): Promise<ExternalMcpDiscovery> {
    return this.discoverWithAuthProvider(actor, connection, {
      token: async () => bearerToken,
    });
  }

  private async discoverWithAuthProvider(
    actor: AgentActor,
    connection: AgentMcpConnection,
    authProvider?: AuthProvider,
  ): Promise<ExternalMcpDiscovery> {
    const { client, close, config } = await this.connectClient(
      actor,
      connection,
      authProvider,
    );

    try {
      const { tools } = await client.listTools();
      if (tools.length > config.maxToolsPerConnection) {
        throw new Error('외부 MCP tool 개수가 허용 한도를 초과했습니다.');
      }
      const server = client.getServerVersion();

      return {
        ...(server?.name ? { serverName: server.name } : {}),
        ...(server?.version ? { serverVersion: server.version } : {}),
        tools: tools.map((tool) => ({
          name: tool.name,
          ...(tool.title ? { title: tool.title } : {}),
          ...(tool.description ? { description: tool.description } : {}),
          inputSchema: tool.inputSchema,
          ...(tool.annotations
            ? {
                annotations: {
                  ...(tool.annotations.readOnlyHint !== undefined
                    ? { readOnlyHint: tool.annotations.readOnlyHint }
                    : {}),
                  ...(tool.annotations.destructiveHint !== undefined
                    ? { destructiveHint: tool.annotations.destructiveHint }
                    : {}),
                  ...(tool.annotations.idempotentHint !== undefined
                    ? { idempotentHint: tool.annotations.idempotentHint }
                    : {}),
                  ...(tool.annotations.openWorldHint !== undefined
                    ? { openWorldHint: tool.annotations.openWorldHint }
                    : {}),
                },
              }
            : {}),
        })),
      };
    } finally {
      await close().catch(() => undefined);
    }
  }

  private async connectClient(
    actor: AgentActor,
    connection: AgentMcpConnection,
    authProviderOverride?: AuthProvider,
  ) {
    const config = this.configService.getOrThrow('agentMcpConnections', {
      infer: true,
    });
    const endpoint = await this.safeOutbound.assertSafe(connection.endpoint);
    const client = new Client(
      {
        name: 'teamspace-agent-external-mcp',
        version: '0.0.1',
      },
      {
        versionNegotiation: { mode: { pin: '2026-07-28' } },
        inputRequired: { autoFulfill: false },
        listMaxPages: 4,
        cachePartition: `${actor.userId}:${actor.organizationId}`,
      },
    );
    this.boundToolDiscovery(client, config.connectTimeoutMs);

    let closePromise: Promise<void> | undefined;
    const close = (): Promise<void> => {
      closePromise ??= client.close();
      return closePromise;
    };

    try {
      const authProvider =
        authProviderOverride ?? this.createAuthProvider(actor, connection);
      const transport = new StreamableHTTPClientTransport(endpoint, {
        fetch: (input, init) => this.safeOutbound.fetch(input, init),
        ...(authProvider ? { authProvider } : {}),
        redirectPolicy: 'follow',
        onInsufficientScope: 'throw',
      });
      await client.connect(transport, {
        signal: AbortSignal.timeout(config.connectTimeoutMs),
      });
      return { client, close, config };
    } catch (error) {
      await close().catch(() => undefined);
      throw error;
    }
  }

  private boundToolDiscovery(client: Client, timeoutMs: number): void {
    const listTools = client.listTools.bind(client);
    client.listTools = (params, options) =>
      listTools(params, {
        ...options,
        timeout:
          options?.timeout === undefined
            ? timeoutMs
            : Math.min(options.timeout, timeoutMs),
        maxTotalTimeout:
          options?.maxTotalTimeout === undefined
            ? timeoutMs
            : Math.min(options.maxTotalTimeout, timeoutMs),
      });
  }

  private createAuthProvider(
    actor: AgentActor,
    connection: AgentMcpConnection,
  ): AuthProvider | undefined {
    if (connection.authKind === 'none') {
      return undefined;
    }

    if (connection.authKind === 'oauth') {
      return this.oauth.createRuntimeAuthProvider(actor, connection);
    }

    return {
      token: async () => {
        const token = await this.credentials.getBearerToken(
          actor,
          connection.id,
        );
        if (!token) {
          throw new Error('external MCP bearer credential이 없습니다.');
        }
        return token;
      },
    };
  }

  private assertResultSize(result: unknown, maximumBytes: number): void {
    let serialized: string;
    try {
      serialized =
        typeof result === 'string' ? result : (JSON.stringify(result) ?? '');
    } catch {
      throw new Error('외부 MCP tool 응답을 안전하게 직렬화할 수 없습니다.');
    }

    if (Buffer.byteLength(serialized, 'utf8') > maximumBytes) {
      throw new Error('외부 MCP tool 응답이 허용 크기를 초과했습니다.');
    }
  }
}
