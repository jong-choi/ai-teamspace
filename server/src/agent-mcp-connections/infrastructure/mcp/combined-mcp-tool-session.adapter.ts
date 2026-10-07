import { Injectable, Logger } from '@nestjs/common';

import { ExternalMcpToolSessionProvider } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-tool-session.provider';
import type { AgentActor } from '@/agent/domain/agent-actor';
import { LangChainWorkOsMcpAdapter } from '@/agent/infrastructure/mcp/langchain/langchain-workos-mcp.adapter';
import {
  type WorkOsToolSession,
  WorkOsToolSessionProvider,
} from '@/agent/infrastructure/mcp/workos-tool-session.provider';

@Injectable()
export class CombinedMcpToolSessionAdapter extends WorkOsToolSessionProvider {
  private readonly logger = new Logger(CombinedMcpToolSessionAdapter.name);

  constructor(
    private readonly workOs: LangChainWorkOsMcpAdapter,
    private readonly external: ExternalMcpToolSessionProvider,
  ) {
    super();
  }

  async open(actor: AgentActor): Promise<WorkOsToolSession> {
    const workOsSession = await this.workOs.open(actor);
    this.markWorkOsTools(workOsSession);

    let externalSession: WorkOsToolSession | undefined;
    try {
      externalSession = await this.external.open(actor);
    } catch (error) {
      this.logger.warn({
        event: 'external_mcp_session_open_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }

    const tools = [
      ...workOsSession.tools,
      ...(externalSession?.tools ?? []),
    ];
    this.assertUniqueToolNames(tools.map((tool) => tool.name));
    const toolIdentities = new Map([
      ...workOsSession.toolIdentities.entries(),
      ...(externalSession ? [...externalSession.toolIdentities.entries()] : []),
    ]);
    if (toolIdentities.size !== tools.length) {
      await Promise.allSettled([
        workOsSession.close(),
        ...(externalSession ? [externalSession.close()] : []),
      ]);
      throw new Error('MCP tool identity 충돌이 감지되었습니다.');
    }

    let closePromise: Promise<void> | undefined;
    const close = (): Promise<void> => {
      closePromise ??= Promise.allSettled([
        workOsSession.close(),
        ...(externalSession ? [externalSession.close()] : []),
      ]).then(() => undefined);
      return closePromise;
    };

    return {
      tools,
      readOnlyTools: workOsSession.readOnlyTools,
      interruptOn: {
        ...workOsSession.interruptOn,
        ...(externalSession?.interruptOn ?? {}),
      },
      toolIdentities,
      close,
    };
  }

  private markWorkOsTools(session: WorkOsToolSession): void {
    for (const tool of session.tools) {
      const annotations = tool.metadata?.['annotations'];
      tool.metadata = {
        ...(annotations === undefined ? {} : { annotations }),
        workOsMcp: {
          source: 'workos',
          namespace: 'workos',
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
