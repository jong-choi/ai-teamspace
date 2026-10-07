import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import {
  type McpPolicyAuditEvent,
  McpPolicyAuditPublisher,
} from '@/mcp-access/infrastructure/audit/mcp-policy-audit.publisher';

@Injectable()
export class LoggerMcpPolicyAuditPublisher extends McpPolicyAuditPublisher {
  private readonly logger = new Logger('McpPolicyAudit');

  publish(event: McpPolicyAuditEvent): void {
    this.logger.log(
      JSON.stringify({
        event: event.name,
        reason: event.reason,
        actorPseudonymousId: pseudonymize(event.actorUserId),
        organizationPseudonymousId: pseudonymize(event.organizationId),
        subjectPseudonymousId: pseudonymize(event.subjectUserId ?? null),
        priorRevision: event.priorRevision,
        nextRevision: event.nextRevision,
        addedScopes: event.addedScopes,
        removedScopes: event.removedScopes,
        affectedUserCount: event.affectedUserCount,
        resultCode: event.resultCode,
        correlationId: event.correlationId,
      }),
    );
  }
}

function pseudonymize(value: string | null): string | null {
  if (value === null) return null;
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}
