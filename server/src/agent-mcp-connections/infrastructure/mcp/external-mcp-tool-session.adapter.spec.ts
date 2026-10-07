import type { ConfigService } from '@nestjs/config';

import type { AgentActor } from '@/agent/domain/agent-actor';
import { AgentMcpConnectionSchema } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import type { AgentMcpAuditPublisher } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.publisher';
import type { ExternalMcpConnectionSessionProvider } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-connection-session.provider';
import { ExternalMcpToolSessionAdapter } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-tool-session.adapter';
import type { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { AllConfigType } from '@/config/config.type';

import type { StructuredTool } from '@langchain/core/tools';

describe('외부 MCP aggregate tool session', () => {
  const actor: AgentActor = {
    userId: 'user-1',
    organizationId: 'org-1',
    permissions: [],
  };

  function connection(index: number) {
    return AgentMcpConnectionSchema.parse({
      id: `0199d54e-282e-7adf-8000-00000000000${index}`,
      ownerUserId: actor.userId,
      organizationId: actor.organizationId,
      displayName: `External ${index}`,
      namespace: `extexample${index}`,
      endpoint: `https://example${index}.com/mcp`,
      transport: 'http',
      authKind: 'none',
      enabled: true,
      toolPolicyMode: 'selected',
      lastTestedAt: null,
      lastErrorCategory: null,
      revision: 0,
      createdAt: new Date('2026-10-07T00:00:00.000Z'),
      updatedAt: new Date('2026-10-07T00:00:00.000Z'),
    });
  }

  function configService(maxConnectionsPerUser: number) {
    return {
      getOrThrow: jest.fn().mockReturnValue({
        maxConnectionsPerUser,
      }),
    } as unknown as ConfigService<AllConfigType>;
  }

  test('한 connection 실패를 격리하고 성공한 external tool만 노출한다', async () => {
    const first = connection(1);
    const second = connection(2);
    const close = jest.fn().mockResolvedValue(undefined);
    const tool = {
      name: 'extexample2__search',
      invoke: jest.fn().mockResolvedValue('ok'),
    } as unknown as StructuredTool;
    const repository = {
      listEnabledForActor: jest.fn().mockResolvedValue([first, second]),
      recordHealth: jest.fn().mockResolvedValue(first),
    } as unknown as AgentMcpConnectionRepository;
    const connections = {
      open: jest.fn().mockImplementation(async (_actor, current) => {
        if (current.id === first.id) {
          throw new Error('remote secret-like failure must not escape');
        }
        return {
          tools: [tool],
          readOnlyTools: [],
          interruptOn: { [tool.name]: true },
          toolIdentities: new Map([
            [
              tool.name,
              {
                source: 'external' as const,
                connectionId: current.id,
                namespace: current.namespace,
                originalToolName: 'search',
                schemaFingerprint: 'a'.repeat(64),
              },
            ],
          ]),
          close,
        };
      }),
    } as unknown as ExternalMcpConnectionSessionProvider;
    const adapter = new ExternalMcpToolSessionAdapter(
      repository,
      connections,
      configService(10),
    );

    const session = await adapter.open(actor);

    expect(session.tools).toEqual([tool]);
    expect(session.readOnlyTools).toEqual([]);
    expect(session.interruptOn).toEqual({ extexample2__search: true });
    expect(session.toolIdentities.get(tool.name)).toMatchObject({
      source: 'external',
      connectionId: second.id,
    });
    expect(repository.recordHealth).toHaveBeenCalledWith(
      actor.userId,
      actor.organizationId,
      first.id,
      expect.any(Date),
      'discovery_failed',
    );
    await session.close();
    await session.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('external tool 호출은 raw args/result 없이 canonical identity와 latency만 audit한다', async () => {
    const current = connection(1);
    const invoke = jest.fn().mockResolvedValue({ secretResult: 'do-not-log' });
    const tool = {
      name: 'extexample1__search',
      invoke,
    } as unknown as StructuredTool;
    const repository = {
      listEnabledForActor: jest.fn().mockResolvedValue([current]),
    } as unknown as AgentMcpConnectionRepository;
    const connections = {
      open: jest.fn().mockResolvedValue({
        tools: [tool],
        readOnlyTools: [],
        interruptOn: { [tool.name]: true },
        toolIdentities: new Map([
          [
            tool.name,
            {
              source: 'external' as const,
              connectionId: current.id,
              namespace: current.namespace,
              originalToolName: 'search',
              schemaFingerprint: 'a'.repeat(64),
            },
          ],
        ]),
        close: jest.fn().mockResolvedValue(undefined),
      }),
    } as unknown as ExternalMcpConnectionSessionProvider;
    const publish = jest.fn().mockResolvedValue(undefined);
    const auditPublisher = {
      publish,
    } as unknown as AgentMcpAuditPublisher;
    const adapter = new ExternalMcpToolSessionAdapter(
      repository,
      connections,
      configService(10),
      auditPublisher,
    );

    const session = await adapter.open(actor);
    const result = await session.tools[0]!.invoke({
      secretInput: 'do-not-log',
    });

    expect(result).toEqual({ secretResult: 'do-not-log' });
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'agent_mcp.tool.called',
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        connectionId: current.id,
        canonicalToolName: tool.name,
        resultCode: 'ok',
        latencyMs: expect.any(Number),
      }),
    );
    expect(JSON.stringify(publish.mock.calls[0]?.[0])).not.toContain(
      'do-not-log',
    );
  });

  test('설정된 user별 connection bound까지만 연다', async () => {
    const repository = {
      listEnabledForActor: jest
        .fn()
        .mockResolvedValue([connection(1), connection(2)]),
    } as unknown as AgentMcpConnectionRepository;
    const connections = {
      open: jest.fn().mockResolvedValue({
        tools: [],
        readOnlyTools: [],
        interruptOn: {},
        toolIdentities: new Map(),
        close: jest.fn().mockResolvedValue(undefined),
      }),
    } as unknown as ExternalMcpConnectionSessionProvider;
    const adapter = new ExternalMcpToolSessionAdapter(
      repository,
      connections,
      configService(1),
    );

    await adapter.open(actor);

    expect(connections.open).toHaveBeenCalledTimes(1);
  });
});
