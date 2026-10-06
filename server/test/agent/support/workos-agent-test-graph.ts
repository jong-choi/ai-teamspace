import type { AgentGraphFactory } from '@repo/agent-runtime';
import { WorkOsAgentFactory } from '@/agent/application/workos-agent.factory';
import { AgentConfiguration } from '@/agent/config/agent-configuration';
import type { AgentConfig } from '@/agent/config/agent-config.type';
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
  const config = {
    databaseUrl: 'postgresql://localhost/agent-test',
    redisUrl: 'redis://localhost:6379',
    redisPrefix: 'agent-test',
    model: 'test:model',
    workOsMcpUrl: input.mcpUrl,
    mcpToolTimeoutMs: input.mcpToolTimeoutMs ?? 5_000,
    runQueueName: 'agent-test-runs',
    runConcurrency: 4,
    runTimeoutMs: 300_000,
    shutdownGraceMs: 30_000,
    migrateOnStartup: true,
    replayStreamTtlSeconds: 3_600,
    replayClosedTtlSeconds: 86_400,
    replayStreamMaxLength: 10_000,
    replaySubscriberBufferFrames: 512,
  } satisfies AgentConfig;
  const configuration = new AgentConfiguration(config);
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
