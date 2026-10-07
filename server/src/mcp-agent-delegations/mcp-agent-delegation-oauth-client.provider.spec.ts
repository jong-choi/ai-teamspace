import type { McpConfig } from '@/mcp/config/mcp-config.type';
import { MCP_SCOPES } from '@/mcp/contracts/mcp-scope';
import type { McpAgentDelegationCredentialService } from '@/mcp-agent-delegations/mcp-agent-delegation-credential.service';
import {
  McpAgentDelegationCredentialInvalidError,
  McpAgentDelegationRequiredError,
} from '@/mcp-agent-delegations/mcp-agent-delegation.error';
import { McpAgentDelegationOAuthClientProvider } from '@/mcp-agent-delegations/mcp-agent-delegation-oauth-client.provider';
import type { McpAgentOauthFlowService } from '@/mcp-agent-delegations/mcp-agent-oauth-flow.service';

const config = {
  resourceUrl: 'https://workos.example/mcp',
  resourceOrigin: 'https://workos.example',
  resourcePath: '/mcp',
  allowedHosts: ['workos.example'],
  allowedOrigins: ['workos.example'],
  protocol: {
    modernOnly: true as const,
    maxRequestBodyBytes: 104_857,
    maxToolInputElements: 1_000,
    requestTimeoutMs: 30_000,
  },
  accessKey: {
    defaultExpiresInDays: 30,
    maxExpiresInDays: 365,
    maxActivePerUser: 10,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 60,
    operationRetentionHours: 24,
    reservationStaleAfterSeconds: 300,
  },
  agentDelegation: {
    clientId: 'work-os-agent',
    clientSecret: 'x'.repeat(32),
    redirectUrl: 'https://workos.example/mcp/agent-delegation/callback',
    flowTtlSeconds: 600,
    refreshLeaseTtlSeconds: 15,
    refreshLeaseWaitMs: 5_000,
  },
} satisfies McpConfig;

const flow = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'user-a',
  organizationId: 'org-a',
  issuer: null,
} as never;

describe('MCP Agent OAuthClientProvider', () => {
  const tokens = jest.fn();
  const saveTokens = jest.fn();
  const revoke = jest.fn();
  const saveCodeVerifier = jest.fn();
  const codeVerifier = jest.fn();
  const saveDiscoveryState = jest.fn();
  const discoveryState = jest.fn();
  const consume = jest.fn();

  const credentials = {
    tokens,
    saveTokens,
    revoke,
  } as unknown as McpAgentDelegationCredentialService;

  const flowService = {
    saveCodeVerifier,
    codeVerifier,
    saveDiscoveryState,
    discoveryState,
    consume,
  } as unknown as McpAgentOauthFlowService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('first-party client metadata는 refresh grant를 선언하고 raw client secret은 server-side client information에만 둔다', () => {
    const provider = new McpAgentDelegationOAuthClientProvider(
      { userId: 'user-a', organizationId: 'org-a' },
      config,
      credentials,
      flowService,
      'capture',
      flow,
      'state-a',
    );

    expect(provider.clientMetadata).toMatchObject({
      redirect_uris: [config.agentDelegation.redirectUrl],
      token_endpoint_auth_method: 'client_secret_basic',
      grant_types: ['authorization_code', 'refresh_token'],
      scope: MCP_SCOPES.join(' '),
    });
    expect(JSON.stringify(provider.clientMetadata)).not.toContain(
      config.agentDelegation.clientSecret,
    );
  });

  it('discovery에서 resolve된 issuer와 다른 context에는 first-party client secret을 반환하지 않는다', async () => {
    const provider = new McpAgentDelegationOAuthClientProvider(
      { userId: 'user-a', organizationId: 'org-a' },
      config,
      credentials,
      flowService,
      'capture',
      flow,
      'state-a',
    );
    await provider.saveDiscoveryState({
      authorizationServerUrl: 'https://workos.example/api/auth',
    });

    expect(() => provider.clientInformation()).toThrow(
      McpAgentDelegationCredentialInvalidError,
    );
    expect(
      provider.clientInformation({
        issuer: 'https://workos.example/api/auth',
      }),
    ).toMatchObject({
      client_id: 'work-os-agent',
      client_secret: config.agentDelegation.clientSecret,
      issuer: 'https://workos.example/api/auth',
    });

    expect(() =>
      provider.clientInformation({
        issuer: 'https://evil.example/oauth',
      }),
    ).toThrow(McpAgentDelegationCredentialInvalidError);
  });

  it('tokens/saveTokens도 resolve된 issuer binding을 유지한다', async () => {
    tokens.mockResolvedValue(undefined);
    const provider = new McpAgentDelegationOAuthClientProvider(
      { userId: 'user-a', organizationId: 'org-a' },
      config,
      credentials,
      flowService,
      'capture',
      flow,
      'state-a',
    );
    await provider.saveDiscoveryState({
      authorizationServerUrl: 'https://workos.example/api/auth',
    });

    await provider.tokens({ issuer: 'https://workos.example/api/auth' });
    expect(tokens).toHaveBeenCalledWith(
      { userId: 'user-a', organizationId: 'org-a' },
      'https://workos.example/api/auth',
    );

    await provider.saveTokens(
      {
        access_token: 'access',
        token_type: 'Bearer',
        issuer: 'https://workos.example/api/auth',
      },
      { issuer: 'https://workos.example/api/auth' },
    );
    expect(saveTokens).toHaveBeenCalledWith(
      { userId: 'user-a', organizationId: 'org-a' },
      expect.objectContaining({ access_token: 'access' }),
      'https://workos.example/api/auth',
      undefined,
    );

    expect(() =>
      provider.tokens({ issuer: 'https://evil.example/oauth' }),
    ).toThrow(McpAgentDelegationCredentialInvalidError);
  });

  it('interactive start는 authorization URL을 capture하고 runtime provider는 redirect를 거부한다', () => {
    const capture = new McpAgentDelegationOAuthClientProvider(
      { userId: 'user-a', organizationId: 'org-a' },
      config,
      credentials,
      flowService,
      'capture',
      flow,
      'state-a',
    );
    capture.redirectToAuthorization(
      new URL('https://workos.example/api/auth/oauth2/authorize?state=state-a'),
    );
    expect(capture.authorizationUrl().hostname).toBe('workos.example');

    const reject = new McpAgentDelegationOAuthClientProvider(
      { userId: 'user-a', organizationId: 'org-a' },
      config,
      credentials,
      flowService,
      'reject',
    );
    expect(() =>
      reject.redirectToAuthorization(
        new URL('https://workos.example/api/auth/oauth2/authorize'),
      ),
    ).toThrow(McpAgentDelegationRequiredError);
  });
});
