import type { AgentMcpLastErrorCategory } from '@/agent-mcp-connections/domain/agent-mcp-connection-health';
import type { AgentMcpConnection } from '@/agent-mcp-connections/domain/agent-mcp-connection';

export type AgentMcpAuditEventName =
  | 'agent_mcp.connection.created'
  | 'agent_mcp.connection.updated'
  | 'agent_mcp.connection.deleted'
  | 'agent_mcp.connection.enabled'
  | 'agent_mcp.connection.disabled'
  | 'agent_mcp.credential.replaced'
  | 'agent_mcp.credential.refreshed'
  | 'agent_mcp.credential.revoked'
  | 'agent_mcp.oauth.started'
  | 'agent_mcp.oauth.completed'
  | 'agent_mcp.oauth.failed'
  | 'agent_mcp.discovery.completed'
  | 'agent_mcp.discovery.failed'
  | 'agent_mcp.tool_policy.updated'
  | 'agent_mcp.tool.called';

export type AgentMcpAuditEvent = {
  name: AgentMcpAuditEventName;
  actorUserId: string;
  organizationId: string;
  connectionId: string;
  resultCode: 'ok' | 'failed';
  authKind?: AgentMcpConnection['authKind'];
  toolPolicyMode?: AgentMcpConnection['toolPolicyMode'];
  priorRevision?: number | null;
  nextRevision?: number | null;
  toolCount?: number;
  canonicalToolName?: string;
  latencyMs?: number;
  errorCategory?: AgentMcpLastErrorCategory;
};

export abstract class AgentMcpAuditPublisher {
  abstract publish(event: AgentMcpAuditEvent): void | Promise<void>;
}
