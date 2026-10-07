import { Logger } from '@nestjs/common';

import { LoggerMcpPolicyAuditPublisher } from '@/mcp-access/infrastructure/audit/logger-mcp-policy-audit.publisher';

describe('LoggerMcpPolicyAuditPublisher', () => {
  it('raw actor/organization/user id를 로그에 노출하지 않는다', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const publisher = new LoggerMcpPolicyAuditPublisher();

    publisher.publish({
      name: 'mcp.policy.provisioned',
      reason: 'system_provisioned',
      actorUserId: 'secret-actor-id',
      organizationId: 'secret-org-id',
      subjectUserId: 'secret-subject-id',
      priorRevision: null,
      nextRevision: 0,
      addedScopes: ['wiki:read'],
      removedScopes: [],
      affectedUserCount: 1,
      resultCode: 'ok',
      correlationId: 'correlation-1',
    });

    const serialized = String(log.mock.calls[0]?.[0]);
    expect(serialized).not.toContain('secret-actor-id');
    expect(serialized).not.toContain('secret-org-id');
    expect(serialized).not.toContain('secret-subject-id');
    expect(serialized).toContain('system_provisioned');

    log.mockRestore();
  });
});
