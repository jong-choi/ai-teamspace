import { AgentConfiguration } from '@/agent/config/agent-configuration';
import type { AgentConfig } from '@/agent/config/agent-config.type';
import { AgentTelemetryFactory } from '@/agent/infrastructure/observability/agent-telemetry.factory';
import { LangfuseAgentTelemetryAdapter } from '@/agent/infrastructure/observability/langfuse/langfuse-agent-telemetry.adapter';

const baseConfig = {
  databaseUrl: 'postgresql://localhost/agent-test',
  redisUrl: 'redis://localhost:6379',
  redisPrefix: 'agent-test',
  model: {
    name: 'gpt-oss:120b',
    baseUrl: 'https://ollama.com',
    apiKey: 'test-ollama-key',
  },
  mcpToolTimeoutMs: 30_000,
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

function configuration(config: AgentConfig): AgentConfiguration {
  return new AgentConfiguration(config, {
    resourceUrl: 'http://127.0.0.1:3100/mcp',
  });
}

describe('AgentTelemetryFactory', () => {
  it('observability 설정이 없거나 Langfuse가 꺼져 있으면 sink를 만들지 않는다', () => {
    expect(
      new AgentTelemetryFactory(configuration(baseConfig)).create(),
    ).toBeUndefined();

    const disabled = configuration({
      ...baseConfig,
      observability: {
        langfuse: {
          enabled: false,
          tracingEnvironment: 'test',
          sampleRate: 1,
          captureLevel: 'metadata',
        },
      },
    });
    expect(new AgentTelemetryFactory(disabled).create()).toBeUndefined();
  });

  it('검증된 활성 설정일 때만 Langfuse sink를 만든다', async () => {
    const enabled = configuration({
      ...baseConfig,
      observability: {
        langfuse: {
          enabled: true,
          baseUrl: 'https://cloud.langfuse.com',
          publicKey: 'pk-test',
          secretKey: 'sk-test',
          tracingEnvironment: 'test',
          sampleRate: 1,
          captureLevel: 'metadata',
          idHashSecret: '0123456789abcdef0123456789abcdef',
        },
      },
    });

    const sink = new AgentTelemetryFactory(enabled).create();
    expect(sink).toBeInstanceOf(LangfuseAgentTelemetryAdapter);
    await sink?.shutdown?.();
  });
});
