import type { AgentActor } from '@/agent/domain/agent-actor';
import type { FirstPartyTeamspaceMcpAdapter } from '@/agent/infrastructure/mcp/first-party/first-party-teamspace-mcp.adapter';
import { CombinedMcpToolSessionAdapter } from '@/agent-mcp-connections/infrastructure/mcp/combined-mcp-tool-session.adapter';
import type { ExternalMcpToolSessionProvider } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-tool-session.provider';

import type { StructuredTool } from '@langchain/core/tools';

describe('AI Teamspace와 external MCP combined session', () => {
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

  test('external 전체 장애에도 AI Teamspace tools를 유지한다', async () => {
    const teamspaceTool = tool('teamspace_search', true);
    const teamspaceClose = jest.fn().mockResolvedValue(undefined);
    const teamspace = {
      open: jest.fn().mockResolvedValue({
        tools: [teamspaceTool],
        readOnlyTools: [teamspaceTool],
        interruptOn: {},
        toolIdentities: new Map([
          [
            teamspaceTool.name,
            {
              source: 'teamspace' as const,
              namespace: 'teamspace' as const,
              originalToolName: teamspaceTool.name,
            },
          ],
        ]),
        close: teamspaceClose,
      }),
    } as unknown as FirstPartyTeamspaceMcpAdapter;
    const external = {
      open: jest.fn().mockRejectedValue(new Error('remote failure')),
    } as unknown as ExternalMcpToolSessionProvider;

    const session = await new CombinedMcpToolSessionAdapter(
      teamspace,
      external,
    ).open(actor);

    expect(session.tools).toEqual([teamspaceTool]);
    expect(session.readOnlyTools).toEqual([teamspaceTool]);
    expect(teamspaceTool.metadata?.['teamspaceMcp']).toEqual({
      source: 'teamspace',
      namespace: 'teamspace',
      originalToolName: 'teamspace_search',
    });
    await session.close();
    expect(teamspaceClose).toHaveBeenCalledTimes(1);
  });

  test('external tools를 합치되 readOnly 승격 없이 interruptOn을 보존한다', async () => {
    const teamspaceTool = tool('teamspace_read', true);
    const externalTool = tool('extexample1__search', true);
    const teamspace = {
      open: jest.fn().mockResolvedValue({
        tools: [teamspaceTool],
        readOnlyTools: [teamspaceTool],
        interruptOn: {},
        toolIdentities: new Map([
          [
            teamspaceTool.name,
            {
              source: 'teamspace' as const,
              namespace: 'teamspace' as const,
              originalToolName: teamspaceTool.name,
            },
          ],
        ]),
        close: jest.fn().mockRejectedValue(new Error('close failure')),
      }),
    } as unknown as FirstPartyTeamspaceMcpAdapter;
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
      teamspace,
      external,
    ).open(actor);

    expect(session.tools).toEqual([teamspaceTool, externalTool]);
    expect(session.readOnlyTools).toEqual([teamspaceTool]);
    expect(session.interruptOn).toEqual({
      extexample1__search: true,
    });
    await expect(session.close()).resolves.toBeUndefined();
  });
});
