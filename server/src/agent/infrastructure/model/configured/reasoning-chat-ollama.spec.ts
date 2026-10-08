import { ReasoningChatOllama } from '@/agent/infrastructure/model/configured/reasoning-chat-ollama';

describe('ReasoningChatOllama', () => {
  it('Ollama 요청 파라미터에 선택한 think 수준을 싣는다', () => {
    const model = new ReasoningChatOllama({
      model: 'gpt-oss:120b',
      baseUrl: 'https://ollama.com',
      reasoningEffort: 'low',
    });

    expect(model.invocationParams().think).toBe('low');
    expect(model.think).toBeUndefined();
  });
});
