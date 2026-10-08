import type { AgentReasoningEffort } from '@/agent/domain/agent-reasoning-effort';

import { ChatOllama, type ChatOllamaInput } from '@langchain/ollama';

/**
 * Ollama `think` 수준(low/medium/high)을 요청에 싣는 ChatOllama.
 * `@langchain/ollama`의 `think` 필드는 boolean만 받지만, 요청 파라미터 타입인
 * ollama `ChatRequest.think`는 수준 문자열을 허용하므로 요청 직전에 수준을 지정한다.
 */
export class ReasoningChatOllama extends ChatOllama {
  readonly reasoningEffort: AgentReasoningEffort;

  constructor(
    fields: Omit<ChatOllamaInput, 'think'> & {
      reasoningEffort: AgentReasoningEffort;
    },
  ) {
    const { reasoningEffort, ...rest } = fields;
    super(rest);
    this.reasoningEffort = reasoningEffort;
  }

  override invocationParams(
    options?: this['ParsedCallOptions'],
  ): ReturnType<ChatOllama['invocationParams']> {
    return {
      ...super.invocationParams(options),
      think: this.reasoningEffort,
    };
  }
}
