import {
  McpAuthContextSchema,
  McpAuthMethodSchema,
} from '@/mcp/contracts/mcp-auth-context';
import {
  MCP_SCOPES,
  McpScopeSchema,
  McpScopesSchema,
  normalizeMcpScopes,
} from '@/mcp/contracts/mcp-scope';

describe('MCP 공통 계약', () => {
  it('scope vocabulary를 하나의 canonical 순서로 고정한다', () => {
    expect(MCP_SCOPES).toHaveLength(10);
    expect(McpScopeSchema.options).toEqual(MCP_SCOPES);
  });

  it('scope를 검증하고 중복 제거 후 canonical 순서로 정규화한다', () => {
    expect(
      normalizeMcpScopes([
        'calendar:write',
        'chat:read',
        'calendar:write',
        'organizations:read',
      ]),
    ).toEqual(['organizations:read', 'chat:read', 'calendar:write']);

    expect(
      McpScopesSchema.parse(['wiki:write', 'wiki:read', 'wiki:write']),
    ).toEqual(['wiki:read', 'wiki:write']);
  });

  it('알 수 없는 scope를 거부한다', () => {
    expect(() => normalizeMcpScopes(['admin:*'])).toThrow();
  });

  it('raw credential 없이 인증 주체와 grant만 유지한다', () => {
    expect(
      McpAuthContextSchema.parse({
        authMethod: 'api-key',
        credentialId: 'key_public_id',
        userId: 'user_1',
        clientId: null,
        scopes: ['projects:write', 'projects:read', 'projects:write'],
        allowedOrganizationIds: ['org_2', 'org_1', 'org_2'],
      }),
    ).toEqual({
      authMethod: 'api-key',
      credentialId: 'key_public_id',
      userId: 'user_1',
      clientId: null,
      scopes: ['projects:read', 'projects:write'],
      allowedOrganizationIds: ['org_2', 'org_1'],
    });
  });

  it('지원하는 credential mode만 허용한다', () => {
    expect(McpAuthMethodSchema.options).toEqual([
      'oauth',
      'api-key',
      'first-party-agent',
    ]);
    expect(() => McpAuthMethodSchema.parse('session')).toThrow();
  });
});
