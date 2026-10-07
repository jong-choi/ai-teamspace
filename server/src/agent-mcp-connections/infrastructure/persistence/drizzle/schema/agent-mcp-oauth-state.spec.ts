import { agentMcpOauthStateInsertSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-oauth-state.zod';

describe('외부 MCP OAuth state persistence 계약', () => {
  const baseState = {
    stateHash: 'a'.repeat(64),
    connectionId: '0199d54e-282e-7adf-8000-000000000001',
    ownerUserId: 'user-1',
    organizationId: 'org-1',
    resourceIdentity: 'https://mcp.example.com/mcp',
    redirectUri: 'https://app.example.com/agent/mcp/oauth/callback',
    expiresAt: new Date('2026-10-07T15:10:00.000Z'),
  };

  test('PKCE verifier 저장 전 pending state를 만들 수 있다', () => {
    const parsed = agentMcpOauthStateInsertSchema.parse(baseState);

    expect(parsed.stateHash).toBe(baseState.stateHash);
    expect(parsed.authorizationServer).toBeUndefined();
    expect(parsed.verifierCiphertext).toBeUndefined();
    expect(parsed.consumedAt).toBeUndefined();
  });

  test('공용 crypto envelope 형식의 verifier를 수용한다', () => {
    const parsed = agentMcpOauthStateInsertSchema.parse({
      ...baseState,
      verifierFormatVersion: 1,
      verifierAlgorithm: 'aes-256-gcm',
      verifierKeyId: 'key-1',
      verifierNonce: Buffer.alloc(12, 1).toString('base64'),
      verifierCiphertext: Buffer.from('encrypted-verifier').toString('base64'),
      verifierAuthTag: Buffer.alloc(16, 2).toString('base64'),
    });

    expect(parsed.verifierAlgorithm).toBe('aes-256-gcm');
    expect(parsed.verifierCiphertext).toEqual(expect.any(String));
  });

  test('state hash와 verifier crypto 형식을 엄격히 검증한다', () => {
    expect(() =>
      agentMcpOauthStateInsertSchema.parse({
        ...baseState,
        stateHash: 'raw-oauth-state',
      }),
    ).toThrow();

    expect(() =>
      agentMcpOauthStateInsertSchema.parse({
        ...baseState,
        verifierFormatVersion: 1,
        verifierAlgorithm: 'plaintext',
        verifierKeyId: 'key-1',
        verifierNonce: Buffer.alloc(12, 1).toString('base64'),
        verifierCiphertext: Buffer.from('plain').toString('base64'),
        verifierAuthTag: Buffer.alloc(16, 2).toString('base64'),
      }),
    ).toThrow();
  });
});
