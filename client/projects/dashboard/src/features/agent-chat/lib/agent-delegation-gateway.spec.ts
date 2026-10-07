import {
  mockAgentDelegationGateway,
  resetMockAgentDelegationStateForTests,
} from '@core/features/agent-chat/lib/agent-delegation-gateway';

import { beforeEach, describe, expect, it } from '@jest/globals';

describe('Agent delegation compatibility gateway', () => {
  beforeEach(() => {
    resetMockAgentDelegationStateForTests();
  });

  it('기본 mock은 실제 Agent UI smoke를 막지 않도록 active 상태다', async () => {
    await expect(mockAgentDelegationGateway.get()).resolves.toEqual({
      status: 'active',
      grantedScopes: [],
      expiresAt: null,
    });
  });

  it('start의 authorization continuation은 query cache에 저장할 상태와 분리된다', async () => {
    await expect(
      mockAgentDelegationGateway.start('/ai/thread-1'),
    ).resolves.toEqual({
      status: 'active',
      authorizationUrl: null,
      grantedScopes: [],
      expiresAt: null,
    });

    await expect(mockAgentDelegationGateway.get()).resolves.toEqual({
      status: 'active',
      grantedScopes: [],
      expiresAt: null,
    });
  });

  it('revoke 후 start로 deterministic하게 재연결할 수 있다', async () => {
    await mockAgentDelegationGateway.revoke();
    await expect(mockAgentDelegationGateway.get()).resolves.toMatchObject({
      status: 'revoked',
    });

    await mockAgentDelegationGateway.start('/ai');
    await expect(mockAgentDelegationGateway.get()).resolves.toMatchObject({
      status: 'active',
    });
  });
});
