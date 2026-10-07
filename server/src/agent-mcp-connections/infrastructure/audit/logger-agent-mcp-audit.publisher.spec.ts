import { Logger } from '@nestjs/common';

import { LoggerAgentMcpAuditPublisher } from '@/agent-mcp-connections/infrastructure/audit/logger-agent-mcp-audit.publisher';

describe('LoggerAgentMcpAuditPublisher', () => {
  test('raw user/org/connection id와 secret-like external 값은 audit log에 노출하지 않는다', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const publisher = new LoggerAgentMcpAuditPublisher();

    publisher.publish({
      name: 'agent_mcp.tool.called',
      actorUserId: 'raw-user-secret',
      organizationId: 'raw-org-secret',
      connectionId: 'raw-connection-secret',
      resultCode: 'failed',
      canonicalToolName: 'extexample__search',
      latencyMs: 42,
      errorCategory: 'connection_unavailable',
    });

    const serialized = String(log.mock.calls[0]?.[0]);
    expect(serialized).toContain('agent_mcp.tool.called');
    expect(serialized).toContain('extexample__search');
    expect(serialized).toContain('"latencyMs":42');
    expect(serialized).toContain('connection_unavailable');
    expect(serialized).not.toContain('raw-user-secret');
    expect(serialized).not.toContain('raw-org-secret');
    expect(serialized).not.toContain('raw-connection-secret');
    expect(serialized).not.toContain('https://');
    expect(serialized).not.toContain('Bearer ');
    expect(serialized).not.toContain('access_token');

    log.mockRestore();
  });
});
