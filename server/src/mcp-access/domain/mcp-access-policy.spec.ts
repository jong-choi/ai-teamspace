import { evaluateMcpAccessDecision } from '@/mcp-access/domain/mcp-access-decision';
import {
  getDefaultOrganizationMcpScopes,
  getDefaultUserMcpScopes,
  intersectMcpScopes,
} from '@/mcp-access/mcp-policy-defaults';

describe('MCP access policy domain', () => {
  const baseFacts = {
    requiredScope: 'wiki:write' as const,
    deploymentScopes: ['wiki:read', 'wiki:write'] as const,
    credentialScopes: ['wiki:read', 'wiki:write'] as const,
    credentialOrganizationIds: ['org-1'] as const,
    organizationId: 'org-1',
    organizationAllowedScopes: ['wiki:read', 'wiki:write'] as const,
    userRequestedScopes: ['wiki:read', 'wiki:write'] as const,
    hasMembership: true,
  };

  it.each([
    ['deployment_ceiling', { deploymentScopes: ['wiki:read'] as const }],
    ['credential_scope', { credentialScopes: ['wiki:read'] as const }],
    ['organization_grant', { credentialOrganizationIds: ['org-2'] as const }],
    [
      'organization_policy',
      { organizationAllowedScopes: ['wiki:read'] as const },
    ],
    ['user_policy', { userRequestedScopes: ['wiki:read'] as const }],
    ['membership', { hasMembership: false }],
  ])('첫 실패 경계를 %s reason으로 반환한다', (reason, override) => {
    expect(evaluateMcpAccessDecision({ ...baseFacts, ...override })).toEqual({
      allowed: false,
      requiredScope: 'wiki:write',
      reason,
    });
  });

  it('모든 live policy 경계를 통과하면 허용한다', () => {
    expect(evaluateMcpAccessDecision(baseFacts)).toEqual({
      allowed: true,
      requiredScope: 'wiki:write',
    });
  });

  it('organization grant가 null이면 모든 조직을 grant한 credential로 취급한다', () => {
    expect(
      evaluateMcpAccessDecision({
        ...baseFacts,
        credentialOrganizationIds: null,
      }),
    ).toEqual({
      allowed: true,
      requiredScope: 'wiki:write',
    });
  });

  it('조직 기본값은 조직 영역의 조회와 변경을 모두 허용하고 개인 scope는 담지 않는다', () => {
    expect(getDefaultOrganizationMcpScopes()).toEqual([
      'organizations:read',
      'organizations:write',
      'wiki:read',
      'wiki:write',
      'projects:read',
      'projects:write',
      'calendar:read',
      'calendar:write',
    ]);
  });

  it('사용자 기본값은 조직이 허용한 scope에 개인 scope를 더한다', () => {
    expect(
      getDefaultUserMcpScopes(['wiki:read', 'wiki:write', 'calendar:read']),
    ).toEqual([
      'chat:read',
      'chat:write',
      'wiki:read',
      'wiki:write',
      'calendar:read',
    ]);
  });

  it('effective scope intersection을 canonical 순서로 반환한다', () => {
    expect(
      intersectMcpScopes(
        ['calendar:read', 'wiki:read', 'wiki:write'],
        ['wiki:write', 'wiki:read'],
        ['wiki:read', 'wiki:write'],
      ),
    ).toEqual(['wiki:read', 'wiki:write']);
  });
});
