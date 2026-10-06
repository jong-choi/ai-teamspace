import type { AgentGraphFactory } from '@repo/agent-runtime';
import { WorkOsAgentFactory } from '#server/agent/application/workos-agent.factory.js';
import { AgentConfiguration } from '#server/agent/config/agent-configuration.js';
import { parseAgentEnvironment } from '#server/agent/config/agent-environment.js';
import { DeepAgentBuilder } from '#server/agent/infrastructure/deep-agent/deep-agent.builder.js';
import { DeepAgentWorkOsGraphAdapter } from '#server/agent/infrastructure/deep-agent/deep-agent-workos-graph.adapter.js';
import { LangChainWorkOsMcpAdapter } from '#server/agent/infrastructure/mcp/langchain/langchain-workos-mcp.adapter.js';
import { McpToolApprovalPolicy } from '#server/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy.js';
import type { McpCredentialProvider } from '#server/agent/infrastructure/mcp/mcp-credential.provider.js';
import type { AgentModelProvider } from '#server/agent/infrastructure/model/agent-model.provider.js';

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
