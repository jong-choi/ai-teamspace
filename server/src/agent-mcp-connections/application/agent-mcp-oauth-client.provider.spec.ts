import { AgentMcpOauthClientProvider } from '@/agent-mcp-connections/application/agent-mcp-oauth-client.provider';
import type { AgentMcpOauthCredentialService } from '@/agent-mcp-connections/application/agent-mcp-oauth-credential.service';
import type { AgentMcpOauthStateService } from '@/agent-mcp-connections/application/agent-mcp-oauth-state.service';
import { AgentMcpOauthAuthorizationRequiredError } from '@/agent-mcp-connections/domain/agent-mcp-connection.error';
import type { AgentActor } from '@/agent/domain/agent-actor';

describe('external MCP OAuth SDK provider bridge', () => {
  const actor: AgentActor = {
    userId: 'user-1',
    organizationId: 'org-1',
    permissions: [],
  };
  const connectionId = '0199d54e-282e-7adf-8000-000000000001';
  const callbackUrl =
    'https://app.example.com/agent/mcp-connections/oauth/callback';
  const issuer = 'https://auth.example.com/';

  function dependencies() {
    const credentials = {
      clientInformation: jest.fn().mockResolvedValue(undefined),
      saveClientInformation: jest.fn().mockResolvedValue(undefined),
      tokens: jest.fn().mockResolvedValue(undefined),
      saveTokens: jest.fn().mockResolvedValue(undefined),
      invalidate: jest.fn().mockResolvedValue(undefined),
    } as unknown as AgentMcpOauthCredentialService;
    const stateService = {
      createState: jest.fn().mockResolvedValue({
        state: 'state-secret',
      }),
      saveCodeVerifier: jest.fn().mockResolvedValue(undefined),
      codeVerifier: jest.fn().mockResolvedValue('pkce-secret'),
      saveDiscoveryState: jest.fn().mockResolvedValue(undefined),
      discoveryState: jest.fn().mockResolvedValue(undefined),
      consumeState: jest.fn().mockResolvedValue({}),
    } as unknown as AgentMcpOauthStateService;
    return { credentials, stateService };
  }

  test('state와 PKCE/discovery 저장을 제품 state service에 위임한다', async () => {
    const deps = dependencies();
    const provider = new AgentMcpOauthClientProvider(
      actor,
      connectionId,
      callbackUrl,
      deps.credentials,
      deps.stateService,
      'capture',
    );

    await expect(provider.state()).resolves.toBe('state-secret');
    await expect(provider.state()).resolves.toBe('state-secret');
    expect(deps.stateService.createState).toHaveBeenCalledTimes(1);

    await provider.saveCodeVerifier('pkce-secret');
    await expect(provider.codeVerifier()).resolves.toBe('pkce-secret');
    expect(deps.stateService.saveCodeVerifier).toHaveBeenCalledWith(
      actor,
      connectionId,
      'state-secret',
      callbackUrl,
      'pkce-secret',
    );

    const discovery = {
      authorizationServerUrl: issuer,
    };
    await provider.saveDiscoveryState(discovery);
    expect(deps.stateService.saveDiscoveryState).toHaveBeenCalledWith(
      actor,
      connectionId,
      'state-secret',
      callbackUrl,
      discovery,
    );
  });

  test('issuer-bound client/token storage와 authorization redirect capture를 위임한다', async () => {
    const deps = dependencies();
    const provider = new AgentMcpOauthClientProvider(
      actor,
      connectionId,
      callbackUrl,
      deps.credentials,
      deps.stateService,
      'capture',
      'state-secret',
    );
    const clientInformation = {
      client_id: 'client-1',
      issuer,
    };
    const tokens = {
      access_token: 'access-token',
      token_type: 'Bearer',
      issuer,
    };

    await provider.saveClientInformation(clientInformation, { issuer });
    await provider.saveTokens(tokens, { issuer });
    expect(deps.credentials.saveClientInformation).toHaveBeenCalledWith(
      actor,
      connectionId,
      clientInformation,
      issuer,
    );
    expect(deps.credentials.saveTokens).toHaveBeenCalledWith(
      actor,
      connectionId,
      tokens,
      issuer,
    );

    provider.redirectToAuthorization(
      new URL('https://auth.example.com/authorize?state=state-secret'),
    );
    expect(provider.authorizationUrl().toString()).toContain(
      'https://auth.example.com/authorize',
    );
  });

  test('SDK credential invalidation을 encrypted storage와 pending state에 위임한다', async () => {
    const deps = dependencies();
    const provider = new AgentMcpOauthClientProvider(
      actor,
      connectionId,
      callbackUrl,
      deps.credentials,
      deps.stateService,
      'capture',
      'state-secret',
    );

    await provider.invalidateCredentials('tokens');
    expect(deps.credentials.invalidate).toHaveBeenCalledWith(
      actor,
      connectionId,
      'tokens',
    );
    expect(deps.stateService.consumeState).not.toHaveBeenCalled();

    await provider.invalidateCredentials('discovery');
    expect(deps.stateService.consumeState).toHaveBeenCalledWith(
      actor,
      connectionId,
      'state-secret',
      callbackUrl,
    );
  });

  test('runtime provider는 새 interactive authorization redirect를 거부한다', () => {
    const deps = dependencies();
    const provider = new AgentMcpOauthClientProvider(
      actor,
      connectionId,
      callbackUrl,
      deps.credentials,
      deps.stateService,
      'reject',
    );

    expect(() =>
      provider.redirectToAuthorization(
        new URL('https://auth.example.com/authorize'),
      ),
    ).toThrow(AgentMcpOauthAuthorizationRequiredError);
  });
});
