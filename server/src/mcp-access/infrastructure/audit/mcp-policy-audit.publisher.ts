import type { McpScope } from '@/mcp/contracts/mcp-scope';

export type McpPolicyAuditEventName =
  | 'mcp.policy.organization.updated'
  | 'mcp.policy.user.updated'
  | 'mcp.policy.user.pruned'
  | 'mcp.policy.provisioned';

export type McpPolicyAuditReason =
  | 'human_update'
  | 'membership_removed'
  | 'reconciliation'
  | 'system_provisioned';

export type McpPolicyAuditEvent = {
  name: McpPolicyAuditEventName;
  reason: McpPolicyAuditReason;
  actorUserId: string | null;
  organizationId: string;
  subjectUserId?: string;
  priorRevision: number | null;
  nextRevision: number | null;
  addedScopes: readonly McpScope[];
  removedScopes: readonly McpScope[];
  affectedUserCount: number;
  resultCode: 'ok';
  correlationId: string;
};

export abstract class McpPolicyAuditPublisher {
  abstract publish(event: McpPolicyAuditEvent): void | Promise<void>;
}
