import {
  toMcpOrganizationPolicyDomain,
  toMcpOrganizationPolicyInsert,
} from '@/mcp-access/infrastructure/persistence/drizzle/mappers/mcp-organization-policy.mapper';
import {
  toMcpUserPolicyDomain,
  toMcpUserPolicyInsert,
} from '@/mcp-access/infrastructure/persistence/drizzle/mappers/mcp-user-policy.mapper';

describe('MCP policy persistence mappers', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('DB organization scope row를 canonical order/dedup으로 normalize한다', () => {
    expect(
      toMcpOrganizationPolicyDomain({
        organizationId: 'org-a',
        allowedScopes: ['wiki:read', 'organizations:read', 'wiki:read'],
        revision: 2,
        updatedByUserId: null,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({
      organizationId: 'org-a',
      allowedScopes: ['organizations:read', 'wiki:read'],
      revision: 2,
    });
  });

  it('DB에서 canonical set 밖 scope가 들어오면 fail-closed한다', () => {
    expect(() =>
      toMcpUserPolicyDomain({
        organizationId: 'org-a',
        userId: 'user-a',
        requestedScopes: ['wiki:read', 'admin:all'],
        revision: 0,
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow();
  });

  it('insert mapper도 canonical scope schema를 공유한다', () => {
    expect(
      toMcpOrganizationPolicyInsert({
        organizationId: 'org-a',
        allowedScopes: ['calendar:read', 'wiki:read', 'calendar:read'],
        updatedByUserId: null,
      }),
    ).toMatchObject({
      allowedScopes: ['wiki:read', 'calendar:read'],
    });

    expect(
      toMcpUserPolicyInsert({
        organizationId: 'org-a',
        userId: 'user-a',
        requestedScopes: ['projects:read', 'organizations:read'],
      }),
    ).toMatchObject({
      requestedScopes: ['organizations:read', 'projects:read'],
    });
  });
});
