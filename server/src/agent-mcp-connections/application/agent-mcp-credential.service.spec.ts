import type { AgentActor } from '@/agent/domain/agent-actor';
import { AgentMcpCredentialService } from '@/agent-mcp-connections/application/agent-mcp-credential.service';
import { AgentMcpConnectionSchema } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import { AgentMcpConnectionAuthKindMismatchError } from '@/agent-mcp-connections/domain/agent-mcp-connection.error';
import type { AgentMcpAuditPublisher } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.publisher';
import type { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { CredentialCryptoProvider } from '@/credential-crypto/credential-crypto.provider';

describe('외부 MCP bearer credential 서비스', () => {
  const actor: AgentActor = {
    userId: 'user-1',
    organizationId: 'org-1',
    permissions: [],
  };
  const connectionId = '0199d54e-282e-7adf-8000-000000000001';

  function connection(authKind: 'none' | 'bearer' | 'oauth') {
    return AgentMcpConnectionSchema.parse({
      id: connectionId,
      ownerUserId: actor.userId,
      organizationId: actor.organizationId,
      displayName: 'External MCP',
      namespace: 'extexample1',
      endpoint: 'https://example.com/mcp',
      transport: 'http',
      authKind,
      enabled: false,
      toolPolicyMode: 'selected',
      lastTestedAt: null,
      lastErrorCategory: null,
      revision: 0,
      createdAt: new Date('2026-10-07T00:00:00.000Z'),
      updatedAt: new Date('2026-10-07T00:00:00.000Z'),
    });
  }

  test('bearer token을 owner/org/connection AAD로 암호화해 저장한다', async () => {
    const saveCredential = jest.fn().mockResolvedValue(undefined);
    const repository = {
      findOwned: jest.fn().mockResolvedValue(connection('bearer')),
      saveCredential,
    } as unknown as AgentMcpConnectionRepository;
    const crypto = {
      encrypt: jest.fn().mockResolvedValue({
        version: 1,
        algorithm: 'aes-256-gcm',
        keyId: 'key-1',
        nonce: Buffer.alloc(12, 1).toString('base64'),
        ciphertext: Buffer.from('ciphertext').toString('base64'),
        authTag: Buffer.alloc(16, 2).toString('base64'),
      }),
    } as unknown as CredentialCryptoProvider;
    const auditPublisher = {
      publish: jest.fn().mockRejectedValue(new Error('audit unavailable')),
    } as unknown as AgentMcpAuditPublisher;
    const service = new AgentMcpCredentialService(
      repository,
      crypto,
      auditPublisher,
    );

    await service.saveBearerToken(actor, connectionId, 'secret-token');

    expect(crypto.encrypt).toHaveBeenCalledWith('secret-token', {
      recordKind: 'agent-mcp-credential',
      recordId: connectionId,
      userId: actor.userId,
      organizationId: actor.organizationId,
      version: 1,
    });
    expect(saveCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId,
        algorithm: 'aes-256-gcm',
        ciphertext: expect.any(String),
      }),
    );
    expect(JSON.stringify(saveCredential.mock.calls)).not.toContain(
      'secret-token',
    );
    expect(auditPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'agent_mcp.credential.replaced',
        connectionId,
        resultCode: 'ok',
        authKind: 'bearer',
      }),
    );
  });

  test('bearer가 아닌 connection에는 token을 저장하지 않는다', async () => {
    const repository = {
      findOwned: jest.fn().mockResolvedValue(connection('none')),
      saveCredential: jest.fn(),
    } as unknown as AgentMcpConnectionRepository;
    const crypto = {
      encrypt: jest.fn(),
    } as unknown as CredentialCryptoProvider;
    const service = new AgentMcpCredentialService(repository, crypto);

    await expect(
      service.saveBearerToken(actor, connectionId, 'secret-token'),
    ).rejects.toBeInstanceOf(AgentMcpConnectionAuthKindMismatchError);
    expect(crypto.encrypt).not.toHaveBeenCalled();
    expect(repository.saveCredential).not.toHaveBeenCalled();
  });

  test('소유 connection이 없으면 bearer token 조회는 null이다', async () => {
    const repository = {
      findOwned: jest.fn().mockResolvedValue(null),
    } as unknown as AgentMcpConnectionRepository;
    const crypto = {} as CredentialCryptoProvider;
    const service = new AgentMcpCredentialService(repository, crypto);

    await expect(
      service.getBearerToken(actor, connectionId),
    ).resolves.toBeNull();
  });
});
