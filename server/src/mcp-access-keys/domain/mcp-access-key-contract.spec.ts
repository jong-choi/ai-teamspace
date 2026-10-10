import {
  extractMcpCredential,
  withoutMcpUrlCredential,
} from '@/mcp/infrastructure/auth/mcp-credential.extractor';
import {
  grantToAllowedOrganizationIds,
  McpAccessKeyMetadataSchema,
  permissionMapToScopes,
  scopesToPermissionMap,
} from '@/mcp-access-keys/domain/mcp-access-key-contract';

describe('MCP access key canonical contract', () => {
  it('scope와 Better Auth permission map을 양방향 canonical mapping한다', () => {
    const permissions = scopesToPermissionMap([
      'wiki:write',
      'organizations:read',
      'wiki:read',
      'wiki:write',
    ]);

    expect(permissions).toEqual({
      organizations: ['read'],
      wiki: ['read', 'write'],
    });
    expect(permissionMapToScopes(permissions)).toEqual([
      'organizations:read',
      'wiki:read',
      'wiki:write',
    ]);
  });

  it('unknown permission action을 거부한다', () => {
    expect(() => permissionMapToScopes({ wiki: ['admin'] })).toThrow();
  });

  it('selected organization grant를 dedupe/canonicalize한다', () => {
    const metadata = McpAccessKeyMetadataSchema.parse({
      kind: 'workos-mcp-user',
      version: 1,
      organizationGrant: {
        mode: 'selected',
        organizationIds: ['org-b', 'org-a', 'org-b'],
      },
    });

    expect(grantToAllowedOrganizationIds(metadata)).toEqual(['org-a', 'org-b']);
  });
});

describe('MCP credential extraction', () => {
  it('wos_mcp_ Bearer만 API key verifier로 routing한다', () => {
    const request = new Request('https://workos.example/mcp', {
      headers: { authorization: 'Bearer wos_mcp_secret' },
    });

    expect(extractMcpCredential(request)).toEqual({
      method: 'api-key',
      secret: 'wos_mcp_secret',
      source: 'bearer',
    });
  });

  it('다른 Bearer는 OAuth verifier로 routing한다', () => {
    const request = new Request('https://workos.example/mcp', {
      headers: { authorization: 'Bearer oauth-token' },
    });

    expect(extractMcpCredential(request)).toEqual({
      method: 'oauth',
      secret: 'oauth-token',
    });
  });

  it('Authorization 없이 X-API-Key를 compatibility surface로 허용한다', () => {
    const request = new Request('https://workos.example/mcp', {
      headers: { 'x-api-key': 'wos_mcp_secret' },
    });

    expect(extractMcpCredential(request)).toEqual({
      method: 'api-key',
      secret: 'wos_mcp_secret',
      source: 'x-api-key',
    });
  });

  it('Authorization과 X-API-Key 동시 사용을 거부한다', () => {
    const request = new Request('https://workos.example/mcp', {
      headers: {
        authorization: 'Bearer oauth-token',
        'x-api-key': 'wos_mcp_secret',
      },
    });

    expect(() => extractMcpCredential(request)).toThrow(
      'Authorization과 X-API-Key를 동시에 사용할 수 없습니다.',
    );
  });

  it('header가 없으면 주소의 wos_token을 API key로 받는다', () => {
    const request = new Request(
      'https://workos.example/mcp?wos_token=wos_mcp_secret',
    );

    expect(extractMcpCredential(request)).toEqual({
      method: 'api-key',
      secret: 'wos_mcp_secret',
      source: 'url',
    });
  });

  it('주소의 access key와 credential header 동시 사용을 거부한다', () => {
    const request = new Request(
      'https://workos.example/mcp?wos_token=wos_mcp_secret',
      { headers: { authorization: 'Bearer oauth-token' } },
    );

    expect(() => extractMcpCredential(request)).toThrow(
      '주소의 access key와 credential header를 동시에 사용할 수 없습니다.',
    );
  });

  it('주소에 access key가 여러 번 실리면 거부한다', () => {
    const request = new Request(
      'https://workos.example/mcp?wos_token=wos_mcp_a&wos_token=wos_mcp_b',
    );

    expect(() => extractMcpCredential(request)).toThrow(
      '주소의 access key 형식이 올바르지 않습니다.',
    );
  });

  it('MCP SDK로 넘기는 요청에서는 주소의 access key를 지운다', () => {
    const request = new Request(
      'https://workos.example/mcp?wos_token=wos_mcp_secret&other=1',
      { method: 'POST', body: '{}' },
    );

    expect(withoutMcpUrlCredential(request).url).toBe(
      'https://workos.example/mcp?other=1',
    );
  });
});
