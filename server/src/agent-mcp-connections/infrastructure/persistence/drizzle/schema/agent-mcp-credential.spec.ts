import { agentMcpCredentialInsertSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-credential.zod';

describe('외부 MCP credential persistence 계약', () => {
  const validEnvelope = {
    connectionId: '0199d54e-282e-7adf-8000-000000000001',
    algorithm: 'aes-256-gcm',
    keyId: 'key-1',
    nonce: Buffer.alloc(12, 1).toString('base64'),
    ciphertext: Buffer.from('encrypted-token').toString('base64'),
    authTag: Buffer.alloc(16, 2).toString('base64'),
  } as const;

  test('공용 credential crypto envelope 형식을 그대로 수용한다', () => {
    const parsed = agentMcpCredentialInsertSchema.parse(validEnvelope);

    expect(parsed.algorithm).toBe('aes-256-gcm');
    expect(parsed.keyId).toBe('key-1');
    expect(parsed.formatVersion).toBeUndefined();
  });

  test('지원하지 않는 algorithm과 잘못된 nonce를 거부한다', () => {
    expect(() =>
      agentMcpCredentialInsertSchema.parse({
        ...validEnvelope,
        algorithm: 'plaintext',
      }),
    ).toThrow();

    expect(() =>
      agentMcpCredentialInsertSchema.parse({
        ...validEnvelope,
        nonce: Buffer.alloc(8, 1).toString('base64'),
      }),
    ).toThrow();
  });
});
