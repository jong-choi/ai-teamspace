import { AgentConfiguration } from '@/agent/config/agent-configuration';
import type { AgentConfig } from '@/agent/config/agent-config.type';
import { ConfiguredAgentModelAdapter } from '@/agent/infrastructure/model/configured/configured-agent-model.adapter';

import { ChatOllama } from '@langchain/ollama';

const smokeDescribe =
  process.env['AGENT_REAL_MODEL_SMOKE'] === 'true' ? describe : describe.skip;

smokeDescribe('Ollama Cloud Agent model smoke', () => {
  test('production ChatOllama가 실제 모델 응답을 반환한다', async () => {
    const apiKey = process.env['OLLAMA_API_KEY']?.trim();
    if (!apiKey) {
      throw new Error(
        'AGENT_REAL_MODEL_SMOKE=true이면 OLLAMA_API_KEY가 필요합니다.',
      );
    }

    const config = {
      databaseUrl: 'postgresql://localhost/agent-smoke',
      redisUrl: 'redis://localhost:6379',
      redisPrefix: 'agent-smoke',
      model: {
        name: process.env['AGENT_MODEL']?.trim() || 'gpt-oss:120b',
        baseUrl: process.env['OLLAMA_BASE_URL']?.trim() || 'https://ollama.com',
        apiKey,
      },
      mcpToolTimeoutMs: 30_000,
      runQueueName: 'agent-smoke-runs',
      runConcurrency: 1,
      runTimeoutMs: 60_000,
      shutdownGraceMs: 1_000,
      migrateOnStartup: false,
      replayStreamTtlSeconds: 60,
      replayClosedTtlSeconds: 60,
      replayStreamMaxLength: 100,
      replaySubscriberBufferFrames: 16,
    } satisfies AgentConfig;

    const models = new ConfiguredAgentModelAdapter(
      new AgentConfiguration(config, {
        resourceUrl: 'http://127.0.0.1:3100/mcp',
      }),
    ).createModels();
    expect(models.root).toBeInstanceOf(ChatOllama);

    const response = await (models.root as ChatOllama).invoke(
      'Reply with a short acknowledgement.',
    );
    const content = response.content;
    expect(
      typeof content === 'string' ? content.trim().length : content.length,
    ).toBeGreaterThan(0);
  }, 60_000);
});
