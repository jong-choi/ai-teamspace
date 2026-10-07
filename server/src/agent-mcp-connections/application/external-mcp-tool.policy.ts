import { Injectable } from '@nestjs/common';

import type { AgentMcpConnection } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import type { AgentMcpConnectionTool } from '@/agent-mcp-connections/domain/agent-mcp-connection-tool';
import {
  createAgentMcpToolName,
  createAgentMcpToolSchemaFingerprint,
} from '@/agent-mcp-connections/domain/agent-mcp-tool-identity';
import type { McpToolIdentity } from '@/agent/infrastructure/mcp/workos-tool-session.provider';

import type { StructuredTool } from '@langchain/core/tools';

const TOOL_DESCRIPTION_MAX_BYTES = 4_096;

export interface ExternalMcpToolSelection {
  tools: StructuredTool[];
  toolIdentities: ReadonlyMap<string, McpToolIdentity>;
}

@Injectable()
export class ExternalMcpToolPolicy {
  selectTools(
    connection: AgentMcpConnection,
    discoveredTools: readonly StructuredTool[],
    selectedTools: readonly AgentMcpConnectionTool[],
    maxTools: number,
  ): ExternalMcpToolSelection {
    if (discoveredTools.length > maxTools) {
      throw new Error('외부 MCP tool 개수가 허용 한도를 초과했습니다.');
    }

    const selectedByName = new Map(
      selectedTools
        .filter((tool) => tool.enabled)
        .map((tool) => [tool.originalToolName, tool]),
    );
    const tools: StructuredTool[] = [];
    const toolIdentities = new Map<string, McpToolIdentity>();

    for (const tool of discoveredTools) {
      const originalToolName = tool.name;
      const canonicalName = createAgentMcpToolName(
        connection.namespace,
        originalToolName,
      );
      if (toolIdentities.has(canonicalName)) {
        throw new Error('외부 MCP tool 이름 충돌이 감지되었습니다.');
      }
      if (
        Buffer.byteLength(tool.description ?? '', 'utf8') >
        TOOL_DESCRIPTION_MAX_BYTES
      ) {
        throw new Error('외부 MCP tool description이 허용 크기를 초과했습니다.');
      }
      const schemaFingerprint = createAgentMcpToolSchemaFingerprint(tool.schema);

      if (connection.toolPolicyMode === 'selected') {
        const selected = selectedByName.get(originalToolName);
        if (!selected) {
          continue;
        }
        if (
          selected.schemaFingerprint !== null &&
          selected.schemaFingerprint !== schemaFingerprint
        ) {
          continue;
        }
      }

      const annotations = tool.metadata?.['annotations'];

      tool.name = canonicalName;
      tool.metadata = {
        ...(annotations === undefined ? {} : { annotations }),
        workOsMcp: {
          source: 'external',
          connectionId: connection.id,
          namespace: connection.namespace,
          originalToolName,
          schemaFingerprint,
        },
      };

      tools.push(tool);
      toolIdentities.set(canonicalName, {
        source: 'external',
        connectionId: connection.id,
        namespace: connection.namespace,
        originalToolName,
        schemaFingerprint,
      });
    }

    return { tools, toolIdentities };
  }
}
