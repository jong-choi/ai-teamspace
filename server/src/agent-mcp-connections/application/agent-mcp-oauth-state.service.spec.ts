import { createHash } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';

import type { AgentActor } from '@/agent/domain/agent-actor';
import { AgentMcpOauthStateService } from '@/agent-mcp-connections/application/agent-mcp-oauth-state.service';
import { AgentMcpConnectionSchema } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import { AgentMcpOauthStateInvalidError } from '@/agent-mcp-connections/domain/agent-mcp-connection.error';
import type { AgentMcpOauthState } from '@/agent-mcp-connections/domain/agent-mcp-oauth-state';
import type { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { AllConfigType } from '@/config/config.type';
import type { CredentialCryptoProvider } from '@/credential-crypto/credential-crypto.provider';

describe('외부 MCP OAuth state 서비스', () => {
  const actor: AgentActor = {
    userId: 'user-1',
    organizationId: 'org-1',
    permissions: [],
  };
  const connectionId = '0199d54e-282e-7adf-8000-000000000001';
  const endpoint = 'https://mcp.example.com/custom/mcp';
  const redirectUri = 'https://app.example.com/agent/mcp/oauth/callback';

  function connection() {
    return AgentMcpConnectionSchema.parse({
      id: connectionId,
      ownerUserId: actor.userId,
      organizationId: actor.organizationId,
      displayName: 'OAuth MCP',
      namespace: 'extoauth1',
      endpoint,
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

  function configService() {
    return {
      getOrThrow: jest.fn().mockReturnValue({
        maxResponseBytes: 1_048_576,
      }),
    } as unknown as ConfigService<AllConfigType>;
  }

  function activeState(stateHash: string): AgentMcpOauthState {
    return {
      stateHash,
      connectionId,
      ownerUserId: actor.userId,
      organizationId: actor.organizationId,
      resourceIdentity: endpoint,
      authorizationServer: null,
      redirectUri,
      verifierFormatVersion: 1,
      verifierAlgorithm: 'aes-256-gcm',
      verifierKeyId: 'key-1',
      verifierNonce: Buffer.alloc(12, 1).toString('base64'),
      verifierCiphertext: Buffer.from('encrypted').toString('base64'),
      verifierAuthTag: Buffer.alloc(16, 2).toString('base64'),
      discoveryFormatVersion: null,
      discoveryAlgorithm: null,
      discoveryKeyId: null,
      discoveryNonce: null,
      discoveryCiphertext: null,
      discoveryAuthTag: null,
      expiresAt: new Date('2026-10-07T15:10:00.000Z'),
      consumedAt: null,
      createdAt: new Date('2026-10-07T15:00:00.000Z'),
    };
  }

  test('raw state 대신 SHA-256 hash만 persistence에 저장한다', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-07T15:00:00.000Z'));
    try {
      const createOAuthState = jest
        .fn()
        .mockImplementation(async (input) => input);
      const repository = {
        findOwned: jest.fn().mockResolvedValue(connection()),
        createOAuthState,
      } as unknown as AgentMcpConnectionRepository;
      const service = new AgentMcpOauthStateService(
        repository,
        {} as CredentialCryptoProvider,
        configService(),
      );

      const created = await service.createState(
        actor,
        connectionId,
        redirectUri,
      );

      expect(created.state).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
      expect(created.expiresAt).toEqual(new Date('2026-10-07T15:10:00.000Z'));
      const persisted = createOAuthState.mock.calls[0]?.[0];
      expect(persisted.stateHash).toBe(
        createHash('sha256').update(created.state).digest('hex'),
      );
      expect(JSON.stringify(persisted)).not.toContain(created.state);
      expect(persisted.resourceIdentity).toBe(endpoint);
      expect(persisted.redirectUri).toBe(redirectUri);
    } finally {
      jest.useRealTimers();
    }
  });

  test('callback state는 hash + owner/org + redirect/resource binding으로 복원한다', async () => {
    const rawState = 'state-value';
    const stateHash = createHash('sha256').update(rawState).digest('hex');
    const repositoryFindActiveOAuthStateByHashMock = jest
      .fn()
      .mockResolvedValue(activeState(stateHash));
    const repository = {
      findOwned: jest.fn().mockResolvedValue(connection()),
      findActiveOAuthStateByHash: repositoryFindActiveOAuthStateByHashMock,
    } as unknown as AgentMcpConnectionRepository;
    const service = new AgentMcpOauthStateService(
      repository,
      {} as CredentialCryptoProvider,
      configService(),
    );

    await expect(
      service.resolveCallbackState(actor, rawState, redirectUri),
    ).resolves.toMatchObject({
      connectionId,
      stateHash,
      resourceIdentity: endpoint,
      redirectUri,
    });
    expect(repositoryFindActiveOAuthStateByHashMock).toHaveBeenCalledWith(
      actor.userId,
      actor.organizationId,
      stateHash,
      expect.any(Date),
    );
  });

  test('callback state redirect binding이 다르면 거부한다', async () => {
    const rawState = 'state-value';
    const stateHash = createHash('sha256').update(rawState).digest('hex');
    const repositoryFindActiveOAuthStateByHashMock = jest
      .fn()
      .mockResolvedValue(activeState(stateHash));
    const repository = {
      findOwned: jest.fn().mockResolvedValue(connection()),
      findActiveOAuthStateByHash: repositoryFindActiveOAuthStateByHashMock,
    } as unknown as AgentMcpConnectionRepository;
    const service = new AgentMcpOauthStateService(
      repository,
      {} as CredentialCryptoProvider,
      configService(),
    );

    await expect(
      service.resolveCallbackState(
        actor,
        rawState,
        'https://evil.example.com/callback',
      ),
    ).rejects.toBeInstanceOf(AgentMcpOauthStateInvalidError);
  });

  test('PKCE verifier를 state/user/org AAD로 암호화하고 plaintext를 저장하지 않는다', async () => {
    const rawState = 'state-value';
    const stateHash = createHash('sha256').update(rawState).digest('hex');
    const saveOAuthStateVerifier = jest.fn().mockResolvedValue(true);
    const repository = {
      findOwned: jest.fn().mockResolvedValue(connection()),
      findActiveOAuthState: jest.fn().mockResolvedValue(activeState(stateHash)),
      saveOAuthStateVerifier,
    } as unknown as AgentMcpConnectionRepository;
    const cryptoEncryptMock = jest.fn().mockResolvedValue({
      version: 1,
      algorithm: 'aes-256-gcm',
      keyId: 'key-1',
      nonce: Buffer.alloc(12, 3).toString('base64'),
      ciphertext: Buffer.from('ciphertext').toString('base64'),
      authTag: Buffer.alloc(16, 4).toString('base64'),
    });
    const crypto = {
      encrypt: cryptoEncryptMock,
    } as unknown as CredentialCryptoProvider;
    const service = new AgentMcpOauthStateService(
      repository,
      crypto,
      configService(),
    );

    await service.saveCodeVerifier(
      actor,
      connectionId,
      rawState,
      redirectUri,
      'pkce-secret',
    );

    expect(cryptoEncryptMock).toHaveBeenCalledWith('pkce-secret', {
      recordKind: 'agent-mcp-oauth-pkce',
      recordId: stateHash,
      userId: actor.userId,
      organizationId: actor.organizationId,
      version: 1,
    });
    expect(JSON.stringify(saveOAuthStateVerifier.mock.calls)).not.toContain(
      'pkce-secret',
    );
  });

  test('discovery snapshot을 암호화하고 issuer binding과 함께 복원한다', async () => {
    const rawState = 'state-value';
    const stateHash = createHash('sha256').update(rawState).digest('hex');
    const discovery = {
      authorizationServerUrl: 'https://auth.example.com/',
    };
    const encryptedState: AgentMcpOauthState = {
      ...activeState(stateHash),
      authorizationServer: 'https://auth.example.com/',
      discoveryFormatVersion: 1,
      discoveryAlgorithm: 'aes-256-gcm',
      discoveryKeyId: 'key-1',
      discoveryNonce: Buffer.alloc(12, 5).toString('base64'),
      discoveryCiphertext: Buffer.from('encrypted-discovery').toString(
        'base64',
      ),
      discoveryAuthTag: Buffer.alloc(16, 6).toString('base64'),
    };
    const saveOAuthStateDiscovery = jest.fn().mockResolvedValue(true);
    const repository = {
      findOwned: jest.fn().mockResolvedValue(connection()),
      findActiveOAuthState: jest
        .fn()
        .mockResolvedValueOnce(activeState(stateHash))
        .mockResolvedValueOnce(encryptedState),
      saveOAuthStateDiscovery,
    } as unknown as AgentMcpConnectionRepository;
    const cryptoEncryptMock = jest.fn().mockResolvedValue({
      version: 1,
      algorithm: 'aes-256-gcm',
      keyId: 'key-1',
      nonce: Buffer.alloc(12, 5).toString('base64'),
      ciphertext: Buffer.from('encrypted-discovery').toString('base64'),
      authTag: Buffer.alloc(16, 6).toString('base64'),
    });
    const cryptoDecryptMock = jest
      .fn()
      .mockResolvedValue(JSON.stringify(discovery));
    const crypto = {
      encrypt: cryptoEncryptMock,
      decrypt: cryptoDecryptMock,
    } as unknown as CredentialCryptoProvider;
    const service = new AgentMcpOauthStateService(
      repository,
      crypto,
      configService(),
    );

    await service.saveDiscoveryState(
      actor,
      connectionId,
      rawState,
      redirectUri,
      discovery,
    );
    expect(saveOAuthStateDiscovery).toHaveBeenCalledWith(
      actor.userId,
      actor.organizationId,
      connectionId,
      stateHash,
      expect.any(Date),
      expect.objectContaining({
        authorizationServer: 'https://auth.example.com/',
        discoveryAlgorithm: 'aes-256-gcm',
      }),
    );

    await expect(
      service.discoveryState(actor, connectionId, rawState, redirectUri),
    ).resolves.toEqual(discovery);
    expect(cryptoDecryptMock).toHaveBeenCalledWith(
      expect.objectContaining({ algorithm: 'aes-256-gcm' }),
      {
        recordKind: 'agent-mcp-oauth-discovery',
        recordId: stateHash,
        userId: actor.userId,
        organizationId: actor.organizationId,
        version: 1,
      },
    );
  });

  test('복호화한 discovery issuer가 persisted authorization server와 다르면 mix-up으로 거부한다', async () => {
    const rawState = 'state-value';
    const stateHash = createHash('sha256').update(rawState).digest('hex');
    const encryptedState: AgentMcpOauthState = {
      ...activeState(stateHash),
      authorizationServer: 'https://auth.example.com/',
      discoveryFormatVersion: 1,
      discoveryAlgorithm: 'aes-256-gcm',
      discoveryKeyId: 'key-1',
      discoveryNonce: Buffer.alloc(12, 5).toString('base64'),
      discoveryCiphertext: Buffer.from('encrypted-discovery').toString(
        'base64',
      ),
      discoveryAuthTag: Buffer.alloc(16, 6).toString('base64'),
    };
    const repository = {
      findOwned: jest.fn().mockResolvedValue(connection()),
      findActiveOAuthState: jest.fn().mockResolvedValue(encryptedState),
    } as unknown as AgentMcpConnectionRepository;
    const cryptoDecryptMock = jest.fn().mockResolvedValue(
      JSON.stringify({
        authorizationServerUrl: 'https://attacker.example.com/',
      }),
    );
    const crypto = {
      decrypt: cryptoDecryptMock,
    } as unknown as CredentialCryptoProvider;
    const service = new AgentMcpOauthStateService(
      repository,
      crypto,
      configService(),
    );

    await expect(
      service.discoveryState(actor, connectionId, rawState, redirectUri),
    ).rejects.toBeInstanceOf(AgentMcpOauthStateInvalidError);
  });

  test('active state를 복호화하고 consume CAS 실패는 replay로 거부한다', async () => {
    const rawState = 'state-value';
    const stateHash = createHash('sha256').update(rawState).digest('hex');
    const repository = {
      findOwned: jest.fn().mockResolvedValue(connection()),
      findActiveOAuthState: jest.fn().mockResolvedValue(activeState(stateHash)),
      consumeOAuthState: jest.fn().mockResolvedValue(null),
    } as unknown as AgentMcpConnectionRepository;
    const cryptoDecryptMock = jest.fn().mockResolvedValue('pkce-secret');
    const crypto = {
      decrypt: cryptoDecryptMock,
    } as unknown as CredentialCryptoProvider;
    const service = new AgentMcpOauthStateService(
      repository,
      crypto,
      configService(),
    );

    await expect(
      service.codeVerifier(actor, connectionId, rawState, redirectUri),
    ).resolves.toBe('pkce-secret');
    await expect(
      service.consumeState(actor, connectionId, rawState, redirectUri),
    ).rejects.toBeInstanceOf(AgentMcpOauthStateInvalidError);
  });
});
