import { createAgentRunMetadataStorageKey } from '@core/features/agent-chat/lib/agent-run-metadata-key';

import { describe, expect, it } from '@jest/globals';

describe('Agent run metadata storage key', () => {
  it('user와 organization namespace를 모두 key에 포함한다', () => {
    expect(
      createAgentRunMetadataStorageKey(
        { userId: 'user/a', organizationId: 'org:1' },
        'lg:stream:thread-1',
      ),
    ).toBe('teamspace-agent:user%2Fa:org%3A1:lg:stream:thread-1');
  });

  it('같은 thread여도 organization이 다르면 storage key가 다르다', () => {
    const first = createAgentRunMetadataStorageKey(
      { userId: 'user-a', organizationId: 'org-a' },
      'lg:stream:thread-1',
    );
    const second = createAgentRunMetadataStorageKey(
      { userId: 'user-a', organizationId: 'org-b' },
      'lg:stream:thread-1',
    );

    expect(first).not.toBe(second);
  });
});
