import { UnavailableMcpCredentialAdapter } from '#server/agent/infrastructure/mcp/unavailable/unavailable-mcp-credential.adapter.js';

describe('사용 불가능한 MCP credential 어댑터', () => {
  test('delegation provider가 없으면 anonymous fallback 없이 실행을 거부한다', () => {
    const provider = new UnavailableMcpCredentialAdapter();

    expect(() =>
      provider.getCredential({
        userId: 'user-a',
        displayName: 'User A',
        permissions: [],
      }),
    ).toThrow(
      'WorkOS MCP delegation credential provider가 구성되지 않았습니다.',
    );
  });
});
