import { createHash } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import type { CredentialCryptoProvider } from '@/credential-crypto/credential-crypto.provider';
import type { McpAgentOauthFlow } from '@/mcp-agent-delegations/domain/mcp-agent-oauth-flow';
import type { McpAgentOauthFlowRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-oauth-flow.repository';
import { McpAgentDelegationFlowInvalidError } from '@/mcp-agent-delegations/mcp-agent-delegation.error';
import { McpAgentOauthFlowService } from '@/mcp-agent-delegations/mcp-agent-oauth-flow.service';

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

const envelope = {
  version: 1 as const,
  algorithm: 'aes-256-gcm' as const,
  keyId: 'key-a',
  nonce: 'AAAAAAAAAAAAAAAA',
  ciphertext: 'YQ==',
  authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
};

describe('MCP Agent OAuth flow storage', () => {
  const create = jest.fn();
  const findActiveByStateHash = jest.fn();
  const findActiveById = jest.fn();
  const saveVerifierIfAbsent = jest.fn();
  const saveDiscovery = jest.fn();
  const consume = jest.fn();
  const encrypt = jest.fn();
  const decrypt = jest.fn();

  const service = new McpAgentOauthFlowService(
    {
      create,
      findActiveByStateHash,
      findActiveById,
      saveVerifierIfAbsent,
      saveDiscovery,
      consume,
    } as unknown as McpAgentOauthFlowRepository,
    { encrypt, decrypt } as unknown as CredentialCryptoProvider,
    { getOrThrow: () => config } as unknown as ConfigService<AllConfigType>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    encrypt.mockResolvedValue(envelope);
  });

  it('raw state를 저장하지 않고 SHA-256 hash와 actor/client/resource binding만 persistence에 넘긴다', async () => {
    create.mockImplementation(async (input) => ({
      id: '11111111-1111-4111-8111-111111111111',
      issuer: null,
      verifierFormatVersion: null,
      verifierAlgorithm: null,
      verifierKeyId: null,
      verifierNonce: null,
      verifierCiphertext: null,
      verifierAuthTag: null,
      discoveryFormatVersion: null,
      discoveryAlgorithm: null,
      discoveryKeyId: null,
      discoveryNonce: null,
      discoveryCiphertext: null,
      discoveryAuthTag: null,
      consumedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...input,
    }));

    const result = await service.create(
      { userId: 'user-a', organizationId: 'org-a' },
      '/ai/thread-a',
      'https://dashboard.example/settings/mcp/consent?returnTo=%2Fai%2Fthread-a',
    );

    expect(result.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const persisted = create.mock.calls[0]?.[0];
    expect(persisted.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted.stateHash).not.toContain(result.state);
    expect(JSON.stringify(persisted)).not.toContain(result.state);
    expect(persisted).toMatchObject({
      userId: 'user-a',
      organizationId: 'org-a',
      oauthClientIdentity: 'work-os-agent',
      resourceUrl: 'https://workos.example/mcp',
      redirectUrl: config.agentDelegation.redirectUrl,
      returnTo: '/ai/thread-a',
    });
  });

  it('PKCE verifier와 discovery state를 actor-bound AAD로 암호화한다', async () => {
    const flow = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'user-a',
      organizationId: 'org-a',
      oauthClientIdentity: 'work-os-agent',
      issuer: null,
      stateHash: 'a'.repeat(64),
      requestedScopes: ['organizations:read'],
      resourceUrl: 'https://workos.example/mcp',
      redirectUrl: config.agentDelegation.redirectUrl,
      returnTo: '/ai',
      completionUrl:
        'https://dashboard.example/settings/mcp/consent?returnTo=%2Fai',
      verifierFormatVersion: null,
      verifierAlgorithm: null,
      verifierKeyId: null,
      verifierNonce: null,
      verifierCiphertext: null,
      verifierAuthTag: null,
      discoveryFormatVersion: null,
      discoveryAlgorithm: null,
      discoveryKeyId: null,
      discoveryNonce: null,
      discoveryCiphertext: null,
      discoveryAuthTag: null,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      consumedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies McpAgentOauthFlow;
    findActiveById.mockResolvedValue(flow);
    saveVerifierIfAbsent.mockResolvedValue(flow);
    saveDiscovery.mockResolvedValue({
      ...flow,
      issuer: 'https://workos.example/api/auth',
    });

    await service.saveCodeVerifier(flow, 'pkce-verifier-secret');
    expect(encrypt.mock.calls[0]?.[0]).toBe('pkce-verifier-secret');
    expect(encrypt.mock.calls[0]?.[1]).toEqual({
      recordKind: 'mcp-agent-oauth-verifier',
      recordId: flow.id,
      userId: 'user-a',
      organizationId: 'org-a',
      version: 1,
    });

    await service.saveDiscoveryState(flow, {
      authorizationServerUrl: 'https://workos.example/api/auth',
      resourceMetadataUrl:
        'https://workos.example/.well-known/oauth-protected-resource/mcp',
    });
    expect(encrypt.mock.calls[1]?.[0]).not.toContain('pkce-verifier-secret');
    expect(encrypt.mock.calls[1]?.[1]).toEqual({
      recordKind: 'mcp-agent-oauth-discovery',
      recordId: flow.id,
      userId: 'user-a',
      organizationId: 'org-a',
      version: 1,
    });
    expect(saveDiscovery).toHaveBeenCalledWith(
      flow.id,
      'user-a',
      'org-a',
      expect.any(Date),
      expect.objectContaining({
        issuer: 'https://workos.example/api/auth',
        discoveryKeyId: 'key-a',
      }),
    );
  });

  it('callback state lookup 결과의 canonical client/resource/redirect binding이 다르면 거부한다', async () => {
    findActiveByStateHash.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'user-a',
      organizationId: 'org-a',
      oauthClientIdentity: 'unexpected-client',
      issuer: null,
      stateHash: createHash('sha256').update('raw-state').digest('hex'),
      requestedScopes: ['organizations:read'],
      resourceUrl: config.resourceUrl,
      redirectUrl: config.agentDelegation.redirectUrl,
      returnTo: '/ai',
      completionUrl: 'https://dashboard.example/settings/mcp/consent',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      consumedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(service.resolveCallback('raw-state')).rejects.toBeInstanceOf(
      McpAgentDelegationFlowInvalidError,
    );
  });
});
