import type { AgentGraphFactory } from '@repo/agent-runtime';
import { WorkOsAgentFactory } from '@/agent/application/workos-agent.factory';
import { AgentConfiguration } from '@/agent/config/agent-configuration';
import { parseAgentEnvironment } from '@/agent/config/agent-environment';
import { DeepAgentBuilder } from '@/agent/infrastructure/deep-agent/deep-agent.builder';
import { DeepAgentWorkOsGraphAdapter } from '@/agent/infrastructure/deep-agent/deep-agent-workos-graph.adapter';
import { LangChainWorkOsMcpAdapter } from '@/agent/infrastructure/mcp/langchain/langchain-workos-mcp.adapter';
import { McpToolApprovalPolicy } from '@/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy';
import type { McpCredentialProvider } from '@/agent/infrastructure/mcp/mcp-credential.provider';
import type { AgentModelProvider } from '@/agent/infrastructure/model/agent-model.provider';

export function createTestWorkOsAgentGraphFactory(input: {
  mcpUrl: string;
  modelProvider: AgentModelProvider;
  credentialProvider: McpCredentialProvider;
  mcpToolTimeoutMs?: number;
}): AgentGraphFactory {
  const configuration = new AgentConfiguration(
    parseAgentEnvironment({
      AGENT_DATABASE_URL: 'postgresql://localhost/agent-test',
      AGENT_REDIS_URL: 'redis://localhost:6379',
      AGENT_REDIS_PREFIX: 'agent-test',
      AGENT_MODEL: 'test:model',
      WORKOS_MCP_URL: input.mcpUrl,
      AGENT_MCP_TOOL_TIMEOUT_MS: String(input.mcpToolTimeoutMs ?? 5_000),
      AGENT_RUN_QUEUE_NAME: 'agent-test-runs',
    }),
  );
  const sessions = new LangChainWorkOsMcpAdapter(
    input.credentialProvider,
    configuration,
    new McpToolApprovalPolicy(),
  );
  const graphs = new DeepAgentWorkOsGraphAdapter(
    input.modelProvider,
    sessions,
    new DeepAgentBuilder(),
  );
  return new WorkOsAgentFactory(graphs).createGraphFactory();
}
