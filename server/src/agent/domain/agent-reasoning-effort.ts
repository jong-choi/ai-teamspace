import { z } from 'zod';

/**
 * 사용자가 run마다 고르는 추론 수준이다.
 * 현재 모델(gpt-oss)은 추론을 끌 수 없으므로 `none`은 제공하지 않는다.
 */
export const AGENT_REASONING_EFFORTS = ['low', 'medium', 'high'] as const;

export const AgentReasoningEffortSchema = z.enum(AGENT_REASONING_EFFORTS);

export type AgentReasoningEffort = z.infer<typeof AgentReasoningEffortSchema>;

export const DEFAULT_AGENT_REASONING_EFFORT: AgentReasoningEffort = 'high';

/** 클라이언트가 run configurable에 실어 보내는 추론 수준 key다. */
export const AGENT_REASONING_EFFORT_CONFIGURABLE_KEY = 'reasoning_effort';

/** run configurable에서 추론 수준을 읽는다. 값이 없으면 기본값, 허용되지 않은 값이면 오류다. */
export function resolveAgentReasoningEffort(
  configurable: Record<string, unknown> | undefined,
): AgentReasoningEffort {
  const value = configurable?.[AGENT_REASONING_EFFORT_CONFIGURABLE_KEY];
  if (value === undefined || value === null) {
    return DEFAULT_AGENT_REASONING_EFFORT;
  }
  return AgentReasoningEffortSchema.parse(value);
}
