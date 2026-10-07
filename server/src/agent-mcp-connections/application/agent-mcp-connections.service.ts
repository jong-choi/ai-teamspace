import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AgentMcpCredentialService } from '@/agent-mcp-connections/application/agent-mcp-credential.service';
import { AgentMcpOauthCredentialService } from '@/agent-mcp-connections/application/agent-mcp-oauth-credential.service';
import { AgentMcpOauthService } from '@/agent-mcp-connections/application/agent-mcp-oauth.service';
import { classifyExternalMcpError } from '@/agent-mcp-connections/application/external-mcp-error-category';
import {
  AgentMcpActiveOrganizationRequiredError,
  AgentMcpConnectionCredentialRequiredError,
  AgentMcpConnectionLimitExceededError,
  AgentMcpConnectionNotFoundError,
  AgentMcpConnectionRevisionConflictError,
  AgentMcpDiscoveryFailedError,
} from '@/agent-mcp-connections/domain/agent-mcp-connection.error';
import type { AgentMcpConnection } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import type { AgentMcpLastErrorCategory } from '@/agent-mcp-connections/domain/agent-mcp-connection-health';
import {
  createAgentMcpNamespace,
  createAgentMcpToolSchemaFingerprint,
} from '@/agent-mcp-connections/domain/agent-mcp-tool-identity';
import type { CreateAgentMcpConnectionInput } from '@/agent-mcp-connections/dto/create-agent-mcp-connection.dto';
import {
  AgentMcpConnectionTestSchema,
  type AgentMcpConnectionTestResponse,
  AgentMcpToolCatalogSchema,
  type AgentMcpToolCatalogResponse,
} from '@/agent-mcp-connections/dto/agent-mcp-discovery.dto';
import {
  type AgentMcpConnectionListResponse,
  type AgentMcpConnectionResponse,
  toAgentMcpConnectionResponse,
} from '@/agent-mcp-connections/dto/agent-mcp-connection.dto';
import type { AgentMcpOauthAuthorizationResponse } from '@/agent-mcp-connections/dto/agent-mcp-oauth.dto';
import type { UpdateAgentMcpConnectionInput } from '@/agent-mcp-connections/dto/update-agent-mcp-connection.dto';
import type { UpdateAgentMcpToolPolicyInput } from '@/agent-mcp-connections/dto/update-agent-mcp-tool-policy.dto';
import { AgentMcpAuditPublisher } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.publisher';
import {
  type ExternalMcpDiscovery,
  ExternalMcpDiscoveryProvider,
} from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-discovery.provider';
import { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { AgentActor } from '@/agent/domain/agent-actor';
import type { AllConfigType } from '@/config/config.type';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

@Injectable()
export class AgentMcpConnectionsService {
  constructor(
    private readonly repository: AgentMcpConnectionRepository,
    private readonly credentials: AgentMcpCredentialService,
    private readonly oauthCredentials: AgentMcpOauthCredentialService,
    private readonly oauth: AgentMcpOauthService,
    private readonly discovery: ExternalMcpDiscoveryProvider,
    private readonly organizations: OrganizationsService,
    private readonly configService: ConfigService<AllConfigType>,
    @Optional()
    private readonly auditPublisher?: AgentMcpAuditPublisher,
  ) {}

  async list(
    context: OrganizationActorContext,
  ): Promise<AgentMcpConnectionListResponse> {
    const actor = await this.resolveActor(context);
    const connections = await this.repository.listOwned(
      actor.userId,
      actor.organizationId,
    );

    return {
      items: await Promise.all(
        connections.map((connection) => this.toResponse(actor, connection)),
      ),
    };
  }

  async get(
    context: OrganizationActorContext,
    connectionId: string,
  ): Promise<AgentMcpConnectionResponse> {
    const actor = await this.resolveActor(context);
    const connection = await this.requireOwned(actor, connectionId);
    return this.toResponse(actor, connection);
  }

  async startOauth(
    context: OrganizationActorContext,
    connectionId: string,
  ): Promise<AgentMcpOauthAuthorizationResponse> {
    const actor = await this.resolveActor(context);
    return this.oauth.start(actor, connectionId);
  }

  async finishOauth(
    context: OrganizationActorContext,
    callbackParams: URLSearchParams,
  ): Promise<AgentMcpConnectionResponse> {
    const actor = await this.resolveActor(context);
    const connection = await this.oauth.finish(actor, callbackParams);

    let errorCategory: AgentMcpLastErrorCategory | null = null;
    try {
      const discovery = await this.discovery.discover(actor, connection);
      await this.publishAudit({
        name: 'agent_mcp.discovery.completed',
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        connectionId: connection.id,
        resultCode: 'ok',
        authKind: connection.authKind,
        toolCount: discovery.tools.length,
      });
    } catch (error) {
      errorCategory = classifyExternalMcpError(error);
      await this.publishAudit({
        name: 'agent_mcp.discovery.failed',
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        connectionId: connection.id,
        resultCode: 'failed',
        authKind: connection.authKind,
        errorCategory,
      });
    }

    const healthConnection = await this.recordHealth(
      actor,
      connection,
      errorCategory,
    );
    return this.toResponse(actor, healthConnection);
  }

  async testConnection(
    context: OrganizationActorContext,
    connectionId: string,
  ): Promise<AgentMcpConnectionTestResponse> {
    const actor = await this.resolveActor(context);
    const connection = await this.requireOwned(actor, connectionId);
    await this.assertCredentialConfigured(actor, connection);
    const discovery = await this.discoverSafely(actor, connection);

    let response: AgentMcpConnectionTestResponse;
    try {
      response = AgentMcpConnectionTestSchema.parse({
        status: 'ready',
        ...(discovery.serverName ? { serverName: discovery.serverName } : {}),
        ...(discovery.serverVersion
          ? { serverVersion: discovery.serverVersion }
          : {}),
        toolCount: discovery.tools.length,
      });
    } catch (error) {
      await this.recordHealth(actor, connection, 'discovery_failed');
      throw new AgentMcpDiscoveryFailedError({ cause: error });
    }

    await this.recordHealth(actor, connection, null);
    return response;
  }

  async discoverTools(
    context: OrganizationActorContext,
    connectionId: string,
  ): Promise<AgentMcpToolCatalogResponse> {
    const actor = await this.resolveActor(context);
    const connection = await this.requireOwned(actor, connectionId);
    await this.assertCredentialConfigured(actor, connection);
    const discovery = await this.discoverSafely(actor, connection);
    const selectedTools = await this.repository.listEnabledTools(connection.id);
    const selectedByName = new Map(
      selectedTools.map((tool) => [tool.originalToolName, tool]),
    );

    let response: AgentMcpToolCatalogResponse;
    try {
      const names = new Set<string>();
      const tools = discovery.tools.map((tool) => {
        if (names.has(tool.name)) {
          throw new Error('외부 MCP server가 중복 tool 이름을 반환했습니다.');
        }
        names.add(tool.name);

        const schemaFingerprint = createAgentMcpToolSchemaFingerprint(
          tool.inputSchema,
        );
        const persisted = selectedByName.get(tool.name);
        const schemaChanged = Boolean(
          persisted?.schemaFingerprint &&
          persisted.schemaFingerprint !== schemaFingerprint,
        );
        const selected =
          connection.toolPolicyMode === 'all' ||
          Boolean(persisted && !schemaChanged);

        return {
          originalToolName: tool.name,
          ...(tool.title ? { title: tool.title } : {}),
          ...(tool.description ? { description: tool.description } : {}),
          inputSchema: tool.inputSchema,
          schemaFingerprint,
          selected,
          schemaChanged,
          ...(tool.annotations ? { annotations: tool.annotations } : {}),
        };
      });

      response = AgentMcpToolCatalogSchema.parse({
        ...(discovery.serverName ? { serverName: discovery.serverName } : {}),
        ...(discovery.serverVersion
          ? { serverVersion: discovery.serverVersion }
          : {}),
        tools,
      });
    } catch (error) {
      await this.recordHealth(actor, connection, 'discovery_failed');
      throw new AgentMcpDiscoveryFailedError({ cause: error });
    }

    await this.recordHealth(actor, connection, null);
    return response;
  }

  async create(
    context: OrganizationActorContext,
    input: CreateAgentMcpConnectionInput,
  ): Promise<AgentMcpConnectionResponse> {
    const actor = await this.resolveActor(context);
    const config = this.configService.getOrThrow('agentMcpConnections', {
      infer: true,
    });
    const existing = await this.repository.listOwned(
      actor.userId,
      actor.organizationId,
    );
    if (existing.length >= config.maxConnectionsPerUser) {
      throw new AgentMcpConnectionLimitExceededError();
    }

    const connection = await this.repository.createPendingConnection({
      ownerUserId: actor.userId,
      organizationId: actor.organizationId,
      displayName: input.displayName,
      namespace: createAgentMcpNamespace(),
      endpoint: input.endpoint,
      transport: 'http',
      authKind: input.authKind,
      enabled: false,
      toolPolicyMode: 'selected',
    });

    if (input.authKind === 'none') {
      try {
        const discovery = await this.discovery.discover(actor, connection);
        await this.publishAudit({
          name: 'agent_mcp.discovery.completed',
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          connectionId: connection.id,
          resultCode: 'ok',
          authKind: connection.authKind,
          toolCount: discovery.tools.length,
        });
      } catch (error) {
        await this.publishAudit({
          name: 'agent_mcp.discovery.failed',
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          connectionId: connection.id,
          resultCode: 'failed',
          authKind: connection.authKind,
          errorCategory: classifyExternalMcpError(error),
        });
        await this.removePendingConnection(actor, connection);
        throw new AgentMcpDiscoveryFailedError({ cause: error });
      }
    }

    if (input.authKind === 'bearer') {
      try {
        const discovery = await this.discovery.discoverWithBearerToken(
          actor,
          connection,
          input.bearerToken!,
        );
        await this.publishAudit({
          name: 'agent_mcp.discovery.completed',
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          connectionId: connection.id,
          resultCode: 'ok',
          authKind: connection.authKind,
          toolCount: discovery.tools.length,
        });
      } catch (error) {
        await this.publishAudit({
          name: 'agent_mcp.discovery.failed',
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          connectionId: connection.id,
          resultCode: 'failed',
          authKind: connection.authKind,
          errorCategory: classifyExternalMcpError(error),
        });
        await this.removePendingConnection(actor, connection);
        throw new AgentMcpDiscoveryFailedError({ cause: error });
      }

      try {
        await this.credentials.saveBearerToken(
          actor,
          connection.id,
          input.bearerToken!,
        );
      } catch (error) {
        await this.removePendingConnection(actor, connection);
        throw error;
      }
    }

    await this.publishAudit({
      name: 'agent_mcp.connection.created',
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      connectionId: connection.id,
      resultCode: 'ok',
      authKind: connection.authKind,
      toolPolicyMode: connection.toolPolicyMode,
      priorRevision: null,
      nextRevision: connection.revision,
    });
    return this.toResponse(actor, connection);
  }

  async update(
    context: OrganizationActorContext,
    connectionId: string,
    input: UpdateAgentMcpConnectionInput,
  ): Promise<AgentMcpConnectionResponse> {
    const actor = await this.resolveActor(context);
    const current = await this.requireOwned(actor, connectionId);
    const securityBoundaryChanged =
      (input.endpoint !== undefined && input.endpoint !== current.endpoint) ||
      (input.authKind !== undefined && input.authKind !== current.authKind);

    if (input.enabled === true && !securityBoundaryChanged) {
      await this.assertCredentialConfigured(actor, current);
    }

    const {
      expectedRevision,
      displayName,
      endpoint,
      authKind,
      enabled,
      toolPolicyMode,
    } = input;
    const patch = {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(endpoint !== undefined ? { endpoint } : {}),
      ...(authKind !== undefined ? { authKind } : {}),
      ...(toolPolicyMode !== undefined ? { toolPolicyMode } : {}),
      ...(securityBoundaryChanged
        ? { enabled: false }
        : enabled !== undefined
          ? { enabled }
          : {}),
    };
    const updated = securityBoundaryChanged
      ? await this.repository.updateSecurityBoundaryIfRevision(
          actor.userId,
          actor.organizationId,
          connectionId,
          expectedRevision,
          patch,
        )
      : await this.repository.updateIfRevision(
          actor.userId,
          actor.organizationId,
          connectionId,
          expectedRevision,
          patch,
        );
    if (!updated) {
      throw new AgentMcpConnectionRevisionConflictError();
    }

    await this.publishAudit({
      name: 'agent_mcp.connection.updated',
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      connectionId: updated.id,
      resultCode: 'ok',
      authKind: updated.authKind,
      toolPolicyMode: updated.toolPolicyMode,
      priorRevision: current.revision,
      nextRevision: updated.revision,
    });
    if (current.enabled !== updated.enabled) {
      await this.publishAudit({
        name: updated.enabled
          ? 'agent_mcp.connection.enabled'
          : 'agent_mcp.connection.disabled',
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        connectionId: updated.id,
        resultCode: 'ok',
        authKind: updated.authKind,
        priorRevision: current.revision,
        nextRevision: updated.revision,
      });
    }

    return this.toResponse(actor, updated);
  }

  async updateToolPolicy(
    context: OrganizationActorContext,
    connectionId: string,
    input: UpdateAgentMcpToolPolicyInput,
  ): Promise<AgentMcpConnectionResponse> {
    const actor = await this.resolveActor(context);
    const current = await this.requireOwned(actor, connectionId);
    const config = this.configService.getOrThrow('agentMcpConnections', {
      infer: true,
    });
    if (input.tools.length > config.maxToolsPerConnection) {
      throw new AgentMcpConnectionLimitExceededError();
    }

    const updated = await this.repository.updateToolPolicyIfRevision(
      actor.userId,
      actor.organizationId,
      connectionId,
      input.expectedRevision,
      input.mode,
      input.tools,
    );
    if (!updated) {
      throw new AgentMcpConnectionRevisionConflictError();
    }

    await this.publishAudit({
      name: 'agent_mcp.tool_policy.updated',
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      connectionId: updated.id,
      resultCode: 'ok',
      authKind: updated.authKind,
      toolPolicyMode: updated.toolPolicyMode,
      priorRevision: current.revision,
      nextRevision: updated.revision,
      toolCount: input.tools.filter((tool) => tool.enabled).length,
    });
    return this.toResponse(actor, updated);
  }

  async remove(
    context: OrganizationActorContext,
    connectionId: string,
    expectedRevision: number,
  ): Promise<void> {
    const actor = await this.resolveActor(context);
    const current = await this.requireOwned(actor, connectionId);
    const removed = await this.repository.removeOwned(
      actor.userId,
      actor.organizationId,
      connectionId,
      expectedRevision,
    );
    if (!removed) {
      throw new AgentMcpConnectionRevisionConflictError();
    }
    await this.publishAudit({
      name: 'agent_mcp.connection.deleted',
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      connectionId,
      resultCode: 'ok',
      authKind: current.authKind,
      toolPolicyMode: current.toolPolicyMode,
      priorRevision: current.revision,
      nextRevision: null,
    });
  }

  private async resolveActor(
    context: OrganizationActorContext,
  ): Promise<AgentActor> {
    const { activeOrganization } = await this.organizations.getActive(context);
    if (!activeOrganization) {
      throw new AgentMcpActiveOrganizationRequiredError();
    }
    return {
      userId: context.userId,
      organizationId: activeOrganization.organization.id,
      permissions: [],
    };
  }

  private async requireOwned(
    actor: AgentActor,
    connectionId: string,
  ): Promise<AgentMcpConnection> {
    const connection = await this.repository.findOwned(
      actor.userId,
      actor.organizationId,
      connectionId,
    );
    if (!connection) {
      throw new AgentMcpConnectionNotFoundError();
    }
    return connection;
  }

  private async discoverSafely(
    actor: AgentActor,
    connection: AgentMcpConnection,
  ): Promise<ExternalMcpDiscovery> {
    try {
      const discovery = await this.discovery.discover(actor, connection);
      await this.publishAudit({
        name: 'agent_mcp.discovery.completed',
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        connectionId: connection.id,
        resultCode: 'ok',
        authKind: connection.authKind,
        toolCount: discovery.tools.length,
      });
      return discovery;
    } catch (error) {
      const errorCategory = classifyExternalMcpError(error);
      await this.recordHealth(actor, connection, errorCategory);
      await this.publishAudit({
        name: 'agent_mcp.discovery.failed',
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        connectionId: connection.id,
        resultCode: 'failed',
        authKind: connection.authKind,
        errorCategory,
      });
      throw new AgentMcpDiscoveryFailedError({ cause: error });
    }
  }

  private async removePendingConnection(
    actor: AgentActor,
    connection: AgentMcpConnection,
  ): Promise<void> {
    await this.repository
      .removeOwned(
        actor.userId,
        actor.organizationId,
        connection.id,
        connection.revision,
      )
      .catch(() => false);
  }

  private async recordHealth(
    actor: AgentActor,
    connection: AgentMcpConnection,
    errorCategory: AgentMcpLastErrorCategory | null,
  ): Promise<AgentMcpConnection> {
    const updated = await this.repository.recordHealth(
      actor.userId,
      actor.organizationId,
      connection.id,
      new Date(),
      errorCategory,
    );
    if (!updated) {
      throw new AgentMcpConnectionNotFoundError();
    }
    return updated;
  }

  private async publishAudit(
    event: Parameters<AgentMcpAuditPublisher['publish']>[0],
  ): Promise<void> {
    try {
      await this.auditPublisher?.publish(event);
    } catch {
      // audit sink failure는 connection lifecycle 결과를 바꾸지 않는다.
    }
  }

  private async assertCredentialConfigured(
    actor: AgentActor,
    connection: AgentMcpConnection,
  ): Promise<void> {
    if (connection.authKind === 'none') {
      return;
    }
    if (connection.authKind === 'oauth') {
      if (!(await this.oauthCredentials.hasAccessToken(actor, connection.id))) {
        throw new AgentMcpConnectionCredentialRequiredError();
      }
      return;
    }
    const credential = await this.repository.findCredentialForOwnedConnection(
      actor.userId,
      actor.organizationId,
      connection.id,
    );
    if (!credential) {
      throw new AgentMcpConnectionCredentialRequiredError();
    }
  }

  private async toResponse(
    actor: AgentActor,
    connection: AgentMcpConnection,
  ): Promise<AgentMcpConnectionResponse> {
    const [credential, selectedTools] = await Promise.all([
      connection.authKind === 'none'
        ? Promise.resolve(true)
        : connection.authKind === 'oauth'
          ? this.oauthCredentials.hasAccessToken(actor, connection.id)
          : this.repository
              .findCredentialForOwnedConnection(
                actor.userId,
                actor.organizationId,
                connection.id,
              )
              .then(Boolean),
      this.repository.listEnabledTools(connection.id),
    ]);

    return toAgentMcpConnectionResponse({
      connection,
      credentialConfigured: credential,
      selectedToolCount: selectedTools.length,
    });
  }
}
