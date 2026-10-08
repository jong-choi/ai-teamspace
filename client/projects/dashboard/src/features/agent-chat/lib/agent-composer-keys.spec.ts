import { isAgentComposerSubmitKey } from '@core/features/agent-chat/lib/agent-composer-keys';

import { describe, expect, it } from '@jest/globals';

describe('Agent 입력창 전송 키', () => {
  it('Enter만 누르면 전송한다', () => {
    expect(isAgentComposerSubmitKey({ key: 'Enter' })).toBe(true);
  });

  it('Shift+Enter와 다른 키는 전송하지 않는다', () => {
    expect(isAgentComposerSubmitKey({ key: 'Enter', shiftKey: true })).toBe(
      false,
    );
    expect(isAgentComposerSubmitKey({ key: 'a' })).toBe(false);
  });

  it('IME 조합 중 Enter는 전송하지 않는다', () => {
    expect(isAgentComposerSubmitKey({ key: 'Enter', isComposing: true })).toBe(
      false,
    );
    expect(isAgentComposerSubmitKey({ key: 'Enter', keyCode: 229 })).toBe(
      false,
    );
  });
});
