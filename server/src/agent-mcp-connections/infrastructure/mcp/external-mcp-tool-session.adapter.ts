import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AgentActor } from '@/agent/domain/agent-actor';
import type {
  McpToolIdentity,
  WorkOsToolSession,
} from '@/agent/infrastructure/mcp/workos-tool-session.provider';
import { classifyExternalMcpError } from '@/agent-mcp-connections/application/external-mcp-error-category';
import { AgentMcpAuditPublisher } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.publisher';
import { ExternalMcpConnectionSessionProvider } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-connection-session.provider';
import { ExternalMcpToolSessionProvider } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-tool-session.provider';
import { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { AllConfigType } from '@/config/config.type';

@Injectable()
export class ExternalMcpToolSessionAdapter extends ExternalMcpToolSessionProvider {
  private readonly logger = new Logger(ExternalMcpToolSessionAdapter.name);

  constructor(
    private readonly repository: AgentMcpConnectionRepository,
    private readonly connections: ExternalMcpConnectionSessionProvider,
    private readonly configService: ConfigService<AllConfigType>,
    @Optional()
    private readonly auditPublisher?: AgentMcpAuditPublisher,
  ) {
    super();
  }

  async open(actor: AgentActor): Promise<WorkOsToolSession> {
    const config = this.configService.getOrThrow('agentMcpConnections', {
      infer: true,
    });
    const enabledConnections = await this.repository.listEnabledForActor(
      actor.userId,
      actor.organizationId,
    );
    if (enabledConnections.length > config.maxConnectionsPerUser) {
      this.logger.warn({
        event: 'external_mcp_connection_limit_exceeded',
        userId: actor.userId,
        organizationId: actor.organizationId,
        enabledConnectionCount: enabledConnections.length,
        maximum: config.maxConnectionsPerUser,
      });
    }

    const opened = await Promise.all(
      enabledConnections
        .slice(0, config.maxConnectionsPerUser)
        .map(async (connection) => {
          try {
            return await this.connections.open(actor, connection);
          } catch (error) {
            const errorCategory = classifyExternalMcpError(error);
            await this.repository
              .recordHealth(
                actor.userId,
                actor.organizationId,
                connection.id,
                new Date(),
                errorCategory,
              )
              .catch((healthError: unknown) => {
                this.logger.warn({
                  event: 'external_mcp_health_record_failed',
                  connectionId: connection.id,
                  errorName:
                    healthError instanceof Error
                      ? healthError.name
                      : 'UnknownError',
                });
              });
            this.logger.warn({
              event: 'external_mcp_connection_open_failed',
              connectionId: connection.id,
              errorCategory,
              errorName: error instanceof Error ? error.name : 'UnknownError',
            });
            return null;
          }
        }),
    );
    const sessions = opened.filter(
      (session): session is WorkOsToolSession => session !== null,
    );
    const tools = sessions.flatMap((session) => session.tools);
    const toolIdentities = new Map(
      sessions.flatMap((session) => [...session.toolIdentities.entries()]),
    );
    if (toolIdentities.size !== tools.length) {
      await Promise.allSettled(sessions.map((session) => session.close()));
      throw new Error('외부 MCP tool identity 충돌이 감지되었습니다.');
    }

    const identityMissing = tools.some((tool) => {
      const identity = toolIdentities.get(tool.name);
      return !identity || identity.source !== 'external';
    });
    if (identityMissing) {
      await Promise.allSettled(sessions.map((session) => session.close()));
      throw new Error('외부 MCP tool identity를 확인할 수 없습니다.');
    }
    const auditedTools = tools.map((tool) =>
      this.instrumentTool(
        actor,
        tool,
        toolIdentities.get(tool.name) as Extract<
          McpToolIdentity,
          { source: 'external' }
        >,
      ),
    );

    let closePromise: Promise<void> | undefined;
    const close = (): Promise<void> => {
      closePromise ??= Promise.allSettled(
        sessions.map((session) => session.close()),
      ).then(() => undefined);
      return closePromise;
    };

    return {
      tools: auditedTools,
      readOnlyTools: [],
      interruptOn: Object.fromEntries(
        auditedTools.map((tool) => [tool.name, true] as const),
      ),
      toolIdentities,
      close,
    };
  }

  private instrumentTool(
    actor: AgentActor,
    tool: WorkOsToolSession['tools'][number],
    identity: Extract<McpToolIdentity, { source: 'external' }>,
  ): WorkOsToolSession['tools'][number] {
    const originalInvoke = tool.invoke.bind(tool);
    tool.invoke = (async (...args: Parameters<typeof originalInvoke>) => {
      const startedAt = Date.now();
      try {
        const result = await originalInvoke(...args);
        await this.publishAudit({
          name: 'agent_mcp.tool.called',
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          connectionId: identity.connectionId,
          canonicalToolName: tool.name,
          resultCode: 'ok',
          latencyMs: Math.max(0, Date.now() - startedAt),
        });
        return result;
      } catch (error) {
        await this.publishAudit({
          name: 'agent_mcp.tool.called',
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          connectionId: identity.connectionId,
          canonicalToolName: tool.name,
          resultCode: 'failed',
          latencyMs: Math.max(0, Date.now() - startedAt),
          errorCategory: classifyExternalMcpError(error),
        });
        throw error;
      }
    }) as typeof tool.invoke;
    return tool;
  }

  private async publishAudit(
    event: Parameters<AgentMcpAuditPublisher['publish']>[0],
  ): Promise<void> {
    try {
      await this.auditPublisher?.publish(event);
    } catch {
      // audit sink failure는 external tool 실행 결과를 바꾸지 않는다.
    }
  }
}
