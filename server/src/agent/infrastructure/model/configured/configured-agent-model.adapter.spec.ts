import type { AgentConfig } from '@/agent/config/agent-config.type';
import { AgentConfiguration } from '@/agent/config/agent-configuration';
import { ConfiguredAgentModelAdapter } from '@/agent/infrastructure/model/configured/configured-agent-model.adapter';
import { ReasoningChatOllama } from '@/agent/infrastructure/model/configured/reasoning-chat-ollama';

import { ChatOllama } from '@langchain/ollama';

const config = {
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

describe('ConfiguredAgentModelAdapter', () => {
  test('검증된 Ollama 설정으로 역할별 ChatOllama 인스턴스를 생성한다', () => {
    const adapter = new ConfiguredAgentModelAdapter(
      new AgentConfiguration(config, {
        resourceUrl: 'http://127.0.0.1:3100/mcp',
      }),
    );

    const models = adapter.createModels();
    const roleModels = [models.root, models.researcher, models.operator];

    for (const model of roleModels) {
      expect(model).toBeInstanceOf(ChatOllama);
      expect((model as ChatOllama).model).toBe('gpt-oss:120b');
      expect((model as ChatOllama).baseUrl).toBe('https://ollama.com');
    }
    expect(new Set(roleModels).size).toBe(3);

    const root = models.root as ChatOllama;
    const clientConfig = Reflect.get(root.client, 'config') as {
      headers?: Record<string, string>;
    };
    expect(clientConfig.headers?.Authorization).toBe('Bearer test-ollama-key');
  });

  test('run에서 고른 추론 수준을 역할별 모델 모두에 적용하고 없으면 기본값을 쓴다', () => {
    const adapter = new ConfiguredAgentModelAdapter(
      new AgentConfiguration(config, {
        resourceUrl: 'http://127.0.0.1:3100/mcp',
      }),
    );

    const selected = adapter.createModels(undefined, {
      reasoningEffort: 'medium',
    });
    for (const model of [
      selected.root,
      selected.researcher,
      selected.operator,
    ]) {
      expect(model).toBeInstanceOf(ReasoningChatOllama);
      expect((model as ReasoningChatOllama).invocationParams().think).toBe(
        'medium',
      );
    }

    const fallback = adapter.createModels();
    expect(
      (fallback.root as ReasoningChatOllama).invocationParams().think,
    ).toBe('high');
  });
});
