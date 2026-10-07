import { deriveAgentThreadTitle } from '@core/features/agent-chat/lib/agent-thread-title';

import { describe, expect, it } from '@jest/globals';

describe('deriveAgentThreadTitle', () => {
  it('공백을 정규화하고 짧은 첫 메시지를 그대로 사용한다', () => {
    expect(deriveAgentThreadTitle('  이번 주   일정 알려줘  ')).toBe(
      '이번 주 일정 알려줘',
    );
  });

  it('긴 제목은 bounded length로 자른다', () => {
    const title = deriveAgentThreadTitle('가'.repeat(100));
    expect(title).toHaveLength(72);
    expect(title.endsWith('…')).toBe(true);
  });

  it.each([
    'Bearer abcdefghijklmnopqrstuvwxyz',
    'token=very-secret-value',
    'sk-abcdefghijklmnopqrstuvwxyz123456',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn0123456789',
  ])(
    'credential처럼 보이는 입력은 metadata title에 보존하지 않는다: %s',
    (value) => {
      expect(deriveAgentThreadTitle(value)).toBe('새 Agent 대화');
    },
  );
});
