import { toMcpEffectiveAccess } from '@/mcp-access/dto/mcp-access.dto';
import {
  UpdateMcpOrganizationPolicySchema,
  UpdateMcpUserPolicySchema,
} from '@/mcp-access/dto/update-mcp-policy.dto';

describe('MCP access DTO contract', () => {
  it('effective access는 deployment → organization → user restriction 우선순위를 보존한다', () => {
    const result = toMcpEffectiveAccess({
      deploymentScopes: [
        'organizations:read',
        'wiki:read',
        'wiki:write',
        'projects:read',
      ],
      organizationAllowedScopes: [
        'organizations:read',
        'wiki:read',
        'projects:read',
        'calendar:read',
      ],
      userRequestedScopes: [
        'organizations:read',
        'wiki:write',
        'projects:read',
        'calendar:read',
      ],
    });

    expect(result.effectiveScopes).toEqual([
      'organizations:read',
      'projects:read',
    ]);
    expect(
      result.capabilities.find(
        (capability) => capability.scope === 'wiki:write',
      ),
    ).toMatchObject({
      requested: true,
      organizationAllowed: false,
      effective: false,
      restrictionReason: 'organization_policy',
    });
    expect(
      result.capabilities.find(
        (capability) => capability.scope === 'calendar:read',
      ),
    ).toMatchObject({
      requested: true,
      organizationAllowed: true,
      effective: false,
      restrictionReason: 'deployment_ceiling',
    });
    expect(
      result.capabilities.find(
        (capability) => capability.scope === 'wiki:read',
      ),
    ).toMatchObject({
      requested: false,
      organizationAllowed: true,
      effective: false,
      restrictionReason: 'user_policy',
    });
  });

  it('user update는 canonical scope order/dedup을 적용하고 server-owned field를 입력에서 제거한다', () => {
    expect(
      UpdateMcpUserPolicySchema.parse({
        requestedScopes: ['wiki:read', 'organizations:read', 'wiki:read'],
        expectedRevision: 3,
        revision: 999,
        userId: 'spoofed-user',
        updatedAt: new Date().toISOString(),
      }),
    ).toEqual({
      requestedScopes: ['organizations:read', 'wiki:read'],
      expectedRevision: 3,
    });
  });

  it('organization update는 canonical scope가 아니면 거부한다', () => {
    expect(() =>
      UpdateMcpOrganizationPolicySchema.parse({
        allowedScopes: ['wiki:read', 'admin:all'],
        expectedRevision: 0,
      }),
    ).toThrow();
  });
});
