import { CombinedMcpToolSessionAdapter } from '@/agent-mcp-connections/infrastructure/mcp/combined-mcp-tool-session.adapter';
import type { ExternalMcpToolSessionProvider } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-tool-session.provider';
import type { AgentActor } from '@/agent/domain/agent-actor';
import type { LangChainWorkOsMcpAdapter } from '@/agent/infrastructure/mcp/langchain/langchain-workos-mcp.adapter';

import type { StructuredTool } from '@langchain/core/tools';

describe('Work OS와 external MCP combined session', () => {
  const actor: AgentActor = {
    userId: 'user-1',
    organizationId: 'org-1',
    permissions: [],
  };

  function tool(name: string, readOnlyHint = false): StructuredTool {
    return {
      name,
      metadata: { annotations: { readOnlyHint } },
    } as unknown as StructuredTool;
  }

  test('external 전체 장애에도 Work OS tools를 유지한다', async () => {
    const workOsTool = tool('workos_search', true);
    const workOsClose = jest.fn().mockResolvedValue(undefined);
    const workOs = {
      open: jest.fn().mockResolvedValue({
        tools: [workOsTool],
        readOnlyTools: [workOsTool],
        interruptOn: {},
        toolIdentities: new Map([
          [
            workOsTool.name,
            {
              source: 'workos' as const,
              namespace: 'workos' as const,
              originalToolName: workOsTool.name,
            },
          ],
        ]),
        close: workOsClose,
      }),
    } as unknown as LangChainWorkOsMcpAdapter;
    const external = {
      open: jest.fn().mockRejectedValue(new Error('remote failure')),
    } as unknown as ExternalMcpToolSessionProvider;

    const session = await new CombinedMcpToolSessionAdapter(
      workOs,
      external,
    ).open(actor);

    expect(session.tools).toEqual([workOsTool]);
    expect(session.readOnlyTools).toEqual([workOsTool]);
    expect(workOsTool.metadata?.['workOsMcp']).toEqual({
      source: 'workos',
      namespace: 'workos',
      originalToolName: 'workos_search',
    });
    await session.close();
    expect(workOsClose).toHaveBeenCalledTimes(1);
  });

  test('external tools를 합치되 readOnly 승격 없이 interruptOn을 보존한다', async () => {
    const workOsTool = tool('workos_read', true);
    const externalTool = tool('extexample1__search', true);
    const workOs = {
      open: jest.fn().mockResolvedValue({
        tools: [workOsTool],
        readOnlyTools: [workOsTool],
        interruptOn: {},
        toolIdentities: new Map([
          [
            workOsTool.name,
            {
              source: 'workos' as const,
              namespace: 'workos' as const,
              originalToolName: workOsTool.name,
            },
          ],
        ]),
        close: jest.fn().mockRejectedValue(new Error('close failure')),
      }),
    } as unknown as LangChainWorkOsMcpAdapter;
    const external = {
      open: jest.fn().mockResolvedValue({
        tools: [externalTool],
        readOnlyTools: [],
        interruptOn: { [externalTool.name]: true },
        toolIdentities: new Map([
          [
            externalTool.name,
            {
              source: 'external' as const,
              connectionId: '0199d54e-282e-7adf-8000-000000000001',
              namespace: 'extexample1',
              originalToolName: 'search',
              schemaFingerprint: 'a'.repeat(64),
            },
          ],
        ]),
        close: jest.fn().mockResolvedValue(undefined),
      }),
    } as unknown as ExternalMcpToolSessionProvider;

    const session = await new CombinedMcpToolSessionAdapter(
      workOs,
      external,
    ).open(actor);

    expect(session.tools).toEqual([workOsTool, externalTool]);
    expect(session.readOnlyTools).toEqual([workOsTool]);
    expect(session.interruptOn).toEqual({
      extexample1__search: true,
    });
    await expect(session.close()).resolves.toBeUndefined();
  });
});
