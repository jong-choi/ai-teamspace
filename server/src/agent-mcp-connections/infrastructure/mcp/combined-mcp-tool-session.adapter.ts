import { Injectable, Logger } from '@nestjs/common';

import type { AgentActor } from '@/agent/domain/agent-actor';
import { FirstPartyTeamspaceMcpAdapter } from '@/agent/infrastructure/mcp/first-party/first-party-teamspace-mcp.adapter';
import {
  type TeamspaceToolSession,
  TeamspaceToolSessionProvider,
} from '@/agent/infrastructure/mcp/teamspace-tool-session.provider';
import { ExternalMcpToolSessionProvider } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-tool-session.provider';

@Injectable()
export class CombinedMcpToolSessionAdapter extends TeamspaceToolSessionProvider {
  private readonly logger = new Logger(CombinedMcpToolSessionAdapter.name);

  constructor(
    private readonly teamspace: FirstPartyTeamspaceMcpAdapter,
    private readonly external: ExternalMcpToolSessionProvider,
  ) {
    super();
  }

  async open(actor: AgentActor): Promise<TeamspaceToolSession> {
    const teamspaceSession = await this.teamspace.open(actor);
    this.markTeamspaceTools(teamspaceSession);

    let externalSession: TeamspaceToolSession | undefined;
    try {
      externalSession = await this.external.open(actor);
    } catch (error) {
      this.logger.warn({
        event: 'external_mcp_session_open_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }

    const tools = [
      ...teamspaceSession.tools,
      ...(externalSession?.tools ?? []),
    ];
    this.assertUniqueToolNames(tools.map((tool) => tool.name));
    const toolIdentities = new Map([
      ...teamspaceSession.toolIdentities.entries(),
      ...(externalSession ? [...externalSession.toolIdentities.entries()] : []),
    ]);
    if (toolIdentities.size !== tools.length) {
      await Promise.allSettled([
        teamspaceSession.close(),
        ...(externalSession ? [externalSession.close()] : []),
      ]);
      throw new Error('MCP tool identity 충돌이 감지되었습니다.');
    }

    let closePromise: Promise<void> | undefined;
    const close = (): Promise<void> => {
      closePromise ??= Promise.allSettled([
        teamspaceSession.close(),
        ...(externalSession ? [externalSession.close()] : []),
      ]).then(() => undefined);
      return closePromise;
    };

    return {
      tools,
      readOnlyTools: teamspaceSession.readOnlyTools,
      interruptOn: {
        ...teamspaceSession.interruptOn,
        ...externalSession?.interruptOn,
      },
      toolIdentities,
      close,
    };
  }

  private markTeamspaceTools(session: TeamspaceToolSession): void {
    for (const tool of session.tools) {
      const annotations = tool.metadata?.['annotations'];
      tool.metadata = {
        ...(annotations === undefined ? {} : { annotations }),
        teamspaceMcp: {
          source: 'teamspace',
          namespace: 'teamspace',
          originalToolName: tool.name,
        },
      };
    }
  }

  private assertUniqueToolNames(names: readonly string[]): void {
    if (new Set(names).size !== names.length) {
      throw new Error('MCP tool 이름 충돌이 감지되었습니다.');
    }
  }
}
