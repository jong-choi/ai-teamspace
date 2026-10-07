import {
  getAgentReturnTo,
  isAllowedAgentReturnTo,
  parseAgentReturnTo,
} from '@core/features/agent-chat/lib/agent-return-to';

import { describe, expect, it } from '@jest/globals';

describe('Agent returnTo allowlist', () => {
  it('AI root와 safe thread route만 허용한다', () => {
    expect(isAllowedAgentReturnTo('/ai')).toBe(true);
    expect(isAllowedAgentReturnTo('/ai/thread_123-ABC')).toBe(true);
    expect(isAllowedAgentReturnTo('/projects')).toBe(false);
  });

  it('scheme, protocol-relative, query, hash, encoded separator를 거부한다', () => {
    for (const value of [
      'https://evil.example/ai',
      '//evil.example/ai',
      '/ai/thread?token=secret',
      '/ai/thread#fragment',
      '/ai/%2Fsettings',
      '/ai/../settings',
    ]) {
      expect(isAllowedAgentReturnTo(value)).toBe(false);
      expect(parseAgentReturnTo(value)).toBe('/ai');
    }
  });

  it('invalid thread id는 root AI route로 축소한다', () => {
    expect(getAgentReturnTo('thread-valid_1')).toBe('/ai/thread-valid_1');
    expect(getAgentReturnTo('bad/thread')).toBe('/ai');
    expect(getAgentReturnTo('thread?secret=x')).toBe('/ai');
  });
});
