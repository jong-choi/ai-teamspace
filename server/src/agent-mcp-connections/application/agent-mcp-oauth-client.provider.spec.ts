import type { AgentActor } from '@/agent/domain/agent-actor';
import { AgentMcpOauthClientProvider } from '@/agent-mcp-connections/application/agent-mcp-oauth-client.provider';
import type { AgentMcpOauthCredentialService } from '@/agent-mcp-connections/application/agent-mcp-oauth-credential.service';
import type { AgentMcpOauthStateService } from '@/agent-mcp-connections/application/agent-mcp-oauth-state.service';
import { AgentMcpOauthAuthorizationRequiredError } from '@/agent-mcp-connections/domain/agent-mcp-connection.error';

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
    const credentialsSaveClientInformationMock = jest
      .fn()
      .mockResolvedValue(undefined);
    const credentialsSaveTokensMock = jest.fn().mockResolvedValue(undefined);
    const credentialsInvalidateMock = jest.fn().mockResolvedValue(undefined);
    const credentials = {
      clientInformation: jest.fn().mockResolvedValue(undefined),
      saveClientInformation: credentialsSaveClientInformationMock,
      tokens: jest.fn().mockResolvedValue(undefined),
      saveTokens: credentialsSaveTokensMock,
      invalidate: credentialsInvalidateMock,
    } as unknown as AgentMcpOauthCredentialService;
    const stateServiceCreateStateMock = jest.fn().mockResolvedValue({
      state: 'state-secret',
    });
    const stateServiceSaveCodeVerifierMock = jest
      .fn()
      .mockResolvedValue(undefined);
    const stateServiceSaveDiscoveryStateMock = jest
      .fn()
      .mockResolvedValue(undefined);
    const stateServiceConsumeStateMock = jest.fn().mockResolvedValue({});
    const stateService = {
      createState: stateServiceCreateStateMock,
      saveCodeVerifier: stateServiceSaveCodeVerifierMock,
      codeVerifier: jest.fn().mockResolvedValue('pkce-secret'),
      saveDiscoveryState: stateServiceSaveDiscoveryStateMock,
      discoveryState: jest.fn().mockResolvedValue(undefined),
      consumeState: stateServiceConsumeStateMock,
    } as unknown as AgentMcpOauthStateService;
    return {
      credentialsSaveClientInformationMock,
      credentialsSaveTokensMock,
      credentialsInvalidateMock,
      stateServiceCreateStateMock,
      stateServiceSaveCodeVerifierMock,
      stateServiceSaveDiscoveryStateMock,
      stateServiceConsumeStateMock,
      credentials,
      stateService,
    };
  }

  test('state와 PKCE/discovery 저장을 제품 state service에 위임한다', async () => {
    const deps = dependencies();
    const {
      stateServiceCreateStateMock,
      stateServiceSaveDiscoveryStateMock,
      stateServiceSaveCodeVerifierMock,
    } = deps;
    const provider = new AgentMcpOauthClientProvider(
      actor,
      connectionId,
      callbackUrl,
      deps.credentials,
      deps.stateService,
      'capture',
    );

    const discovery = {
      authorizationServerUrl: issuer,
    };
    // MCP SDK 2.3.1은 interactive state를 요청하기 전에 discovery snapshot을 저장한다.
    await provider.saveDiscoveryState(discovery);
    await expect(provider.state()).resolves.toBe('state-secret');
    await expect(provider.state()).resolves.toBe('state-secret');
    expect(stateServiceCreateStateMock).toHaveBeenCalledTimes(1);
    expect(stateServiceSaveDiscoveryStateMock).toHaveBeenCalledWith(
      actor,
      connectionId,
      'state-secret',
      callbackUrl,
      discovery,
    );

    await provider.saveCodeVerifier('pkce-secret');
    await expect(provider.codeVerifier()).resolves.toBe('pkce-secret');
    expect(stateServiceSaveCodeVerifierMock).toHaveBeenCalledWith(
      actor,
      connectionId,
      'state-secret',
      callbackUrl,
      'pkce-secret',
    );
  });

  test('issuer-bound client/token storage와 authorization redirect capture를 위임한다', async () => {
    const deps = dependencies();
    const { credentialsSaveClientInformationMock, credentialsSaveTokensMock } =
      deps;
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
    expect(credentialsSaveClientInformationMock).toHaveBeenCalledWith(
      actor,
      connectionId,
      clientInformation,
      issuer,
    );
    expect(credentialsSaveTokensMock).toHaveBeenCalledWith(
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
    const { credentialsInvalidateMock, stateServiceConsumeStateMock } = deps;
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
    expect(credentialsInvalidateMock).toHaveBeenCalledWith(
      actor,
      connectionId,
      'tokens',
    );
    expect(stateServiceConsumeStateMock).not.toHaveBeenCalled();

    await provider.invalidateCredentials('discovery');
    expect(stateServiceConsumeStateMock).toHaveBeenCalledWith(
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
