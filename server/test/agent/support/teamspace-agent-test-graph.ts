import type { AgentGraphFactory } from '@repo/agent-runtime';
import { TeamspaceAgentFactory } from '@/agent/application/teamspace-agent.factory';
import type { AgentConfig } from '@/agent/config/agent-config.type';
import { AgentConfiguration } from '@/agent/config/agent-configuration';
import { DeepAgentBuilder } from '@/agent/infrastructure/deep-agent/deep-agent.builder';
import { DeepAgentTeamspaceGraphAdapter } from '@/agent/infrastructure/deep-agent/deep-agent-teamspace-graph.adapter';
import { McpToolApprovalPolicy } from '@/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy';
import type { McpCredentialProvider } from '@/agent/infrastructure/mcp/mcp-credential.provider';
import type { AgentModelProvider } from '@/agent/infrastructure/model/agent-model.provider';

import { CredentialBackedTeamspaceMcpAuthProviderFactory } from '@test/agent/support/credential-backed-teamspace-mcp-auth-provider.factory';
import { HttpTeamspaceMcpSessionProvider } from '@test/agent/support/http-teamspace-mcp-session.provider';

export function createTestTeamspaceAgentGraphFactory(input: {
  mcpUrl: string;
  modelProvider: AgentModelProvider;
  credentialProvider: McpCredentialProvider;
  mcpToolTimeoutMs?: number;
}): AgentGraphFactory {
  const config = {
    databaseUrl: 'postgresql://localhost/agent-test',
    redisUrl: 'redis://localhost:6379',
    redisPrefix: 'agent-test',
    model: {
      name: 'test:model',
      baseUrl: 'http://127.0.0.1:11434',
      apiKey: 'fixture-key',
    },
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
  const configuration = new AgentConfiguration(config, {
    resourceUrl: input.mcpUrl,
  });
  const sessions = new HttpTeamspaceMcpSessionProvider(
    new CredentialBackedTeamspaceMcpAuthProviderFactory(
      input.credentialProvider,
    ),
    configuration,
    new McpToolApprovalPolicy(),
  );
  const graphs = new DeepAgentTeamspaceGraphAdapter(
    input.modelProvider,
    sessions,
    new DeepAgentBuilder(),
    {
      requireAccess: (_context, organizationId) =>
        Promise.resolve({
          organization: {
            id: organizationId,
            name: 'Agent Test Organization',
            slug: 'agent-test-organization',
            logo: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          role: 'member',
        }),
    },
  );
  return new TeamspaceAgentFactory(graphs).createGraphFactory();
}
