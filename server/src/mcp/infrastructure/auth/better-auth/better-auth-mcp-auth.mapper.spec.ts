import {
  getMcpAuthContext,
  mapVerifiedOAuthRequest,
} from '@/mcp/infrastructure/auth/better-auth/better-auth-mcp-auth.mapper';

describe('Better Auth MCP OAuth mapper', () => {
  it('verified claims를 SDK AuthInfo와 raw-free application context로 투영한다', () => {
    const request = new Request('https://workos.example/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer verified-access-token',
      },
    });

    const mapped = mapVerifiedOAuthRequest(
      request,
      {
        sub: 'user-a',
        client_id: 'client-a',
        azp: 'client-a',
        scope: 'wiki:write organizations:read wiki:read wiki:write',
        jti: 'token-id-a',
        exp: 1_800_000_000,
      },
      'https://workos.example/mcp',
    );

    expect(mapped.context).toEqual({
      authMethod: 'oauth',
      credentialId: 'token-id-a',
      userId: 'user-a',
      clientId: 'client-a',
      scopes: ['organizations:read', 'wiki:read', 'wiki:write'],
      allowedOrganizationIds: null,
    });
    expect(mapped.authInfo).toMatchObject({
      token: 'verified-access-token',
      clientId: 'client-a',
      scopes: ['organizations:read', 'wiki:read', 'wiki:write'],
      expiresAt: 1_800_000_000,
    });
    expect(JSON.stringify(mapped.context)).not.toContain(
      'verified-access-token',
    );
    expect(getMcpAuthContext(mapped.authInfo)).toEqual(mapped.context);
  });

  it('client_id와 azp가 다르면 fail-closed한다', () => {
    const request = new Request('https://workos.example/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer verified-access-token',
      },
    });

    expect(() =>
      mapVerifiedOAuthRequest(
        request,
        {
          sub: 'user-a',
          client_id: 'client-a',
          azp: 'client-b',
          scope: 'organizations:read',
        },
        'https://workos.example/mcp',
      ),
    ).toThrow('OAuth access token의 client identity가 일치하지 않습니다.');
  });

  it('offline_access는 OAuth control scope로 제거하고 business scope만 context에 남긴다', () => {
    const request = new Request('https://workos.example/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer verified-access-token',
      },
    });

    const mapped = mapVerifiedOAuthRequest(
      request,
      {
        sub: 'user-a',
        client_id: 'work-os-agent',
        scope: 'offline_access wiki:read organizations:read',
      },
      'https://workos.example/mcp',
    );

    expect(mapped.context.scopes).toEqual(['organizations:read', 'wiki:read']);
    expect(mapped.authInfo.scopes).toEqual(['organizations:read', 'wiki:read']);
  });

  it('offline_access 외 canonical scope가 아닌 claim은 거부한다', () => {
    const request = new Request('https://workos.example/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer verified-access-token',
      },
    });

    expect(() =>
      mapVerifiedOAuthRequest(
        request,
        {
          sub: 'user-a',
          client_id: 'client-a',
          scope: 'organizations:read admin:*',
        },
        'https://workos.example/mcp',
      ),
    ).toThrow();
  });

  it('검증 callback에 raw bearer header가 없으면 거부한다', () => {
    const request = new Request('https://workos.example/mcp', {
      method: 'POST',
    });

    expect(() =>
      mapVerifiedOAuthRequest(
        request,
        {
          sub: 'user-a',
          client_id: 'client-a',
          scope: 'organizations:read',
        },
        'https://workos.example/mcp',
      ),
    ).toThrow('검증된 OAuth bearer token을 찾을 수 없습니다.');
  });
});
