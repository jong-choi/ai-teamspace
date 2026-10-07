import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import {
  type AgentMcpAuditEvent,
  AgentMcpAuditPublisher,
} from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.publisher';

@Injectable()
export class LoggerAgentMcpAuditPublisher extends AgentMcpAuditPublisher {
  private readonly logger = new Logger('AgentMcpAudit');

  publish(event: AgentMcpAuditEvent): void {
    this.logger.log(
      JSON.stringify({
        event: event.name,
        actorPseudonymousId: pseudonymize(event.actorUserId),
        organizationPseudonymousId: pseudonymize(event.organizationId),
        connectionPseudonymousId: pseudonymize(event.connectionId),
        resultCode: event.resultCode,
        ...(event.authKind === undefined ? {} : { authKind: event.authKind }),
        ...(event.toolPolicyMode === undefined
          ? {}
          : { toolPolicyMode: event.toolPolicyMode }),
        ...(event.priorRevision === undefined
          ? {}
          : { priorRevision: event.priorRevision }),
        ...(event.nextRevision === undefined
          ? {}
          : { nextRevision: event.nextRevision }),
        ...(event.toolCount === undefined
          ? {}
          : { toolCount: event.toolCount }),
        ...(event.canonicalToolName === undefined
          ? {}
          : { canonicalToolName: event.canonicalToolName }),
        ...(event.latencyMs === undefined ? {} : { latencyMs: event.latencyMs }),
        ...(event.errorCategory === undefined
          ? {}
          : { errorCategory: event.errorCategory }),
      }),
    );
  }
}

function pseudonymize(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}
