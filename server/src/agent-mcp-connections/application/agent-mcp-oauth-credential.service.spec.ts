import { AgentMcpOauthCredentialService } from '@/agent-mcp-connections/application/agent-mcp-oauth-credential.service';
import { AgentMcpConnectionSchema } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import type { AgentMcpCredential } from '@/agent-mcp-connections/domain/agent-mcp-credential';
import type { AgentMcpAuditPublisher } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.publisher';
import type { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { AgentActor } from '@/agent/domain/agent-actor';
import type { AllConfigType } from '@/config/config.type';
import type { CredentialCryptoProvider } from '@/credential-crypto/credential-crypto.provider';

import type { ConfigService } from '@nestjs/config';

describe('external MCP OAuth credential bundle', () => {
  const actor: AgentActor = {
    userId: 'user-1',
    organizationId: 'org-1',
    permissions: [],
  };
  const connectionId = '0199d54e-282e-7adf-8000-000000000001';
  const issuer = 'https://auth.example.com/';

  function connection() {
    return AgentMcpConnectionSchema.parse({
      id: connectionId,
      ownerUserId: actor.userId,
      organizationId: actor.organizationId,
      displayName: 'OAuth MCP',
      namespace: 'extoauth1',
      endpoint: 'https://mcp.example.com/mcp',
      transport: 'http',
      authKind: 'oauth',
      enabled: false,
      toolPolicyMode: 'selected',
      lastTestedAt: null,
      lastErrorCategory: null,
      revision: 0,
      createdAt: new Date('2026-10-07T00:00:00.000Z'),
      updatedAt: new Date('2026-10-07T00:00:00.000Z'),
    });
  }

  test('token rotation은 기존 refresh token을 보존하고 plaintext를 repository에 저장하지 않는다', async () => {
    let plaintext = '';
    let credential: AgentMcpCredential | null = null;
    const repository = {
      findOwned: jest.fn().mockResolvedValue(connection()),
      findCredentialForOwnedConnection: jest
        .fn()
        .mockImplementation(() => Promise.resolve(credential)),
      replaceCredentialIfRevision: jest
        .fn()
        .mockImplementation(
          async (_userId, _organizationId, input, revision) => {
            if (revision !== (credential?.revision ?? null)) {
              return false;
            }
            credential = {
              connectionId,
              formatVersion: input.formatVersion,
              algorithm: input.algorithm,
              keyId: input.keyId,
              nonce: input.nonce,
              ciphertext: input.ciphertext,
              authTag: input.authTag,
              revision: (credential?.revision ?? -1) + 1,
              refreshLeaseId: null,
              refreshLeaseExpiresAt: null,
              expiresAt: input.expiresAt ?? null,
              refreshedAt: input.refreshedAt ?? null,
              createdAt: new Date('2026-10-07T00:00:00.000Z'),
              updatedAt: new Date('2026-10-07T00:00:00.000Z'),
            };
            return true;
          },
        ),
    } as unknown as AgentMcpConnectionRepository;
    const crypto = {
      encrypt: jest.fn().mockImplementation(async (value: string) => {
        plaintext = value;
        return {
          version: 1,
          algorithm: 'aes-256-gcm',
          keyId: 'key-1',
          nonce: Buffer.alloc(12, 1).toString('base64'),
          ciphertext: Buffer.from('opaque-ciphertext').toString('base64'),
          authTag: Buffer.alloc(16, 2).toString('base64'),
        };
      }),
      decrypt: jest.fn().mockImplementation(async () => plaintext),
    } as unknown as CredentialCryptoProvider;
    const config = {
      getOrThrow: jest.fn().mockReturnValue({ maxResponseBytes: 1_048_576 }),
    } as unknown as ConfigService<AllConfigType>;
    const auditPublisher = {
      publish: jest.fn().mockRejectedValue(new Error('audit unavailable')),
    } as unknown as AgentMcpAuditPublisher;
    const service = new AgentMcpOauthCredentialService(
      repository,
      crypto,
      config,
      auditPublisher,
    );

    await service.saveTokens(
      actor,
      connectionId,
      {
        access_token: 'access-one',
        token_type: 'Bearer',
        refresh_token: 'refresh-secret',
        issuer,
      },
      issuer,
    );
    await service.saveTokens(
      actor,
      connectionId,
      {
        access_token: 'access-two',
        token_type: 'Bearer',
        issuer,
      },
      issuer,
    );

    await expect(
      service.tokens(actor, connectionId, issuer),
    ).resolves.toMatchObject({
      access_token: 'access-two',
      refresh_token: 'refresh-secret',
      issuer,
    });
    expect(JSON.stringify(credential)).not.toContain('access-two');
    expect(JSON.stringify(credential)).not.toContain('refresh-secret');
    expect(crypto.encrypt).toHaveBeenCalledWith(
      expect.stringContaining('access-two'),
      {
        recordKind: 'agent-mcp-oauth-credential',
        recordId: connectionId,
        userId: actor.userId,
        organizationId: actor.organizationId,
        version: 1,
      },
    );

    await service.invalidate(actor, connectionId, 'tokens');

    await expect(
      service.tokens(actor, connectionId, issuer),
    ).resolves.toBeUndefined();
    expect(plaintext).not.toContain('access-two');
    expect(plaintext).not.toContain('refresh-secret');
    expect(auditPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'agent_mcp.credential.revoked',
        connectionId,
        resultCode: 'ok',
        authKind: 'oauth',
      }),
    );
  });

  test('issuer가 다른 token 조회는 credential을 반환하지 않는다', async () => {
    const bundle = JSON.stringify({
      version: 1,
      resourceIdentity: 'https://mcp.example.com/mcp',
      clients: [],
      tokens: {
        access_token: 'access-one',
        token_type: 'Bearer',
        issuer,
      },
    });
    const repository = {
      findOwned: jest.fn().mockResolvedValue(connection()),
      findCredentialForOwnedConnection: jest.fn().mockResolvedValue({
        connectionId,
        formatVersion: 1,
        algorithm: 'aes-256-gcm',
        keyId: 'key-1',
        nonce: Buffer.alloc(12, 1).toString('base64'),
        ciphertext: Buffer.from('opaque').toString('base64'),
        authTag: Buffer.alloc(16, 2).toString('base64'),
        revision: 1,
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
        expiresAt: null,
        refreshedAt: null,
        createdAt: new Date('2026-10-07T00:00:00.000Z'),
        updatedAt: new Date('2026-10-07T00:00:00.000Z'),
      }),
    } as unknown as AgentMcpConnectionRepository;
    const crypto = {
      decrypt: jest.fn().mockResolvedValue(bundle),
    } as unknown as CredentialCryptoProvider;
    const service = new AgentMcpOauthCredentialService(repository, crypto, {
      getOrThrow: jest.fn().mockReturnValue({ maxResponseBytes: 1_048_576 }),
    } as unknown as ConfigService<AllConfigType>);

    await expect(
      service.tokens(actor, connectionId, 'https://other.example.com/'),
    ).resolves.toBeUndefined();
  });
});
