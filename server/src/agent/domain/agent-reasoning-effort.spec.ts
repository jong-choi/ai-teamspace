import {
  DEFAULT_AGENT_REASONING_EFFORT,
  resolveAgentReasoningEffort,
} from '@/agent/domain/agent-reasoning-effort';

describe('resolveAgentReasoningEffort', () => {
  it('configurable에 값이 없으면 기본 추론 수준을 사용한다', () => {
    expect(resolveAgentReasoningEffort(undefined)).toBe(
      DEFAULT_AGENT_REASONING_EFFORT,
    );
    expect(resolveAgentReasoningEffort({ langgraph_auth_user_id: 'u' })).toBe(
      DEFAULT_AGENT_REASONING_EFFORT,
    );
  });

  it('허용된 추론 수준을 그대로 사용한다', () => {
    expect(resolveAgentReasoningEffort({ reasoning_effort: 'low' })).toBe(
      'low',
    );
    expect(resolveAgentReasoningEffort({ reasoning_effort: 'medium' })).toBe(
      'medium',
    );
  });

  it('지원하지 않는 값은 거부한다', () => {
    expect(() =>
      resolveAgentReasoningEffort({ reasoning_effort: 'none' }),
    ).toThrow();
    expect(() =>
      resolveAgentReasoningEffort({ reasoning_effort: 3 }),
    ).toThrow();
  });
});
