import { projectAgentMessageText } from '@core/features/agent-chat/lib/agent-message-presentation';

import { describe, expect, it } from '@jest/globals';
import type { Message } from '@langchain/langgraph-sdk';

describe('Agent message presentation', () => {
  it('text와 image block을 canonical label로 projection한다', () => {
    expect(
      projectAgentMessageText([
        { type: 'text', text: '분석 결과' },
        { type: 'image_url', image_url: 'https://example.invalid/image.png' },
      ]),
    ).toBe('분석 결과\n[이미지 콘텐츠]');
  });

  it('runtime에서 모르는 block은 이미지라고 추측하지 않는다', () => {
    const content = [
      { type: 'future_block', internal: 'do-not-render' },
    ] as unknown as Message['content'];

    expect(projectAgentMessageText(content)).toBe('[지원되지 않는 콘텐츠]');
  });

  it('빈 문자열은 안정적인 fallback을 사용한다', () => {
    expect(projectAgentMessageText('')).toBe(
      '표시할 수 있는 텍스트가 없습니다.',
    );
  });
});
