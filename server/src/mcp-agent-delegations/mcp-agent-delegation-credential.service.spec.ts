import { createHash } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import type { CredentialCryptoProvider } from '@/credential-crypto/credential-crypto.provider';
import { McpAgentDelegationCredentialService } from '@/mcp-agent-delegations/mcp-agent-delegation-credential.service';
import type { McpAgentDelegationRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-delegation.repository';

const envelope = {
  version: 1 as const,
  algorithm: 'aes-256-gcm' as const,
  keyId: 'key-a',
  nonce: 'AAAAAAAAAAAAAAAA',
  ciphertext: 'YQ==',
  authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
};

const config = {
  resourceUrl: 'https://workos.example/mcp',
  agentDelegation: {
    clientId: 'work-os-agent',
    clientSecret: 'x'.repeat(32),
    redirectUrl: 'https://workos.example/mcp/agent-delegation/callback',
    flowTtlSeconds: 600,
    refreshLeaseTtlSeconds: 15,
    refreshLeaseWaitMs: 5_000,
  },
};

describe('MCP Agent delegation credential storage', () => {
  const findActive = jest.fn();
  const findLatestActive = jest.fn();
  const upsertActive = jest.fn();
  const updateTokensUnderLease = jest.fn();
  const revokeActive = jest.fn();
  const encrypt = jest.fn();
  const decrypt = jest.fn();

  const service = new McpAgentDelegationCredentialService(
    {
      findActive,
      findLatestActive,
      upsertActive,
      updateTokensUnderLease,
      revokeActive,
    } as unknown as McpAgentDelegationRepository,
    { encrypt, decrypt } as unknown as CredentialCryptoProvider,
    { getOrThrow: () => config } as unknown as ConfigService<AllConfigType>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findActive.mockResolvedValue(null);
    encrypt.mockResolvedValue(envelope);
    upsertActive.mockImplementation(async (input) => ({
      id: 'delegation-a',
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  it('raw token을 repository row에 넣지 않고 actor/resource/issuer/client AAD로 암호화한다', async () => {
    await service.saveTokens(
      { userId: 'user-a', organizationId: 'org-a' },
      {
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        token_type: 'Bearer',
        scope: 'wiki:write offline_access organizations:read wiki:write',
        issuer: 'https://workos.example/api/auth',
      },
      'https://workos.example/api/auth',
    );

    const expectedRecordId = createHash('sha256')
      .update(
        [
          'https://workos.example/mcp',
          'https://workos.example/api/auth',
          'work-os-agent',
        ].join('\0'),
        'utf8',
      )
      .digest('hex');

    expect(encrypt).toHaveBeenCalledTimes(1);
    expect(encrypt.mock.calls[0]?.[0]).toContain('access-secret');
    expect(encrypt.mock.calls[0]?.[0]).toContain('refresh-secret');
    expect(encrypt.mock.calls[0]?.[1]).toEqual({
      recordKind: 'mcp-agent-delegation-token',
      recordId: expectedRecordId,
      userId: 'user-a',
      organizationId: 'org-a',
      version: 1,
    });

    const persisted = upsertActive.mock.calls[0]?.[0];
    expect(JSON.stringify(persisted)).not.toContain('access-secret');
    expect(JSON.stringify(persisted)).not.toContain('refresh-secret');
    expect(persisted).toMatchObject({
      userId: 'user-a',
      organizationId: 'org-a',
      issuer: 'https://workos.example/api/auth',
      resourceUrl: 'https://workos.example/mcp',
      oauthClientIdentity: 'work-os-agent',
      grantedScopes: ['organizations:read', 'wiki:write'],
      tokensKeyId: 'key-a',
    });
  });

  it('SDK token scope가 없으면 저장을 실패시키지 않고 canonical granted scope를 빈 배열로 둔다', async () => {
    await expect(
      service.saveTokens(
        { userId: 'user-a', organizationId: 'org-a' },
        {
          access_token: 'access-secret',
          token_type: 'Bearer',
          issuer: 'https://workos.example/api/auth',
        },
        'https://workos.example/api/auth',
      ),
    ).resolves.toBeDefined();

    expect(upsertActive).toHaveBeenCalledWith(
      expect.objectContaining({ grantedScopes: [] }),
    );
  });

  it('decrypt 시 row identity와 actor를 같은 AAD에 묶고 issuer stamp를 검증한다', async () => {
    const row = {
      id: 'delegation-a',
      userId: 'user-a',
      organizationId: 'org-a',
      issuer: 'https://workos.example/api/auth',
      resourceUrl: 'https://workos.example/mcp',
      oauthClientIdentity: 'work-os-agent',
      grantedScopes: ['organizations:read'],
      tokensFormatVersion: 1,
      tokensAlgorithm: 'aes-256-gcm',
      tokensKeyId: 'key-a',
      tokensNonce: envelope.nonce,
      tokensCiphertext: envelope.ciphertext,
      tokensAuthTag: envelope.authTag,
      revision: 0,
      refreshLeaseOwner: null,
      refreshLeaseExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
    };
    findActive.mockResolvedValue(row);
    decrypt.mockResolvedValue(
      JSON.stringify({
        access_token: 'access-secret',
        token_type: 'Bearer',
        scope: 'organizations:read',
        issuer: 'https://workos.example/api/auth',
      }),
    );

    await expect(
      service.tokens(
        { userId: 'user-a', organizationId: 'org-a' },
        'https://workos.example/api/auth',
      ),
    ).resolves.toMatchObject({ access_token: 'access-secret' });

    expect(decrypt.mock.calls[0]?.[1]).toMatchObject({
      recordKind: 'mcp-agent-delegation-token',
      userId: 'user-a',
      organizationId: 'org-a',
      version: 1,
    });
  });
});
