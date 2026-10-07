import { mockMcpAccessTransport } from '@core/features/mcp-access/mcp-access-client';
import {
  MCP_ACCESS_SCOPES,
  McpAccessCompositeSchema,
} from '@core/features/mcp-access/mcp-access-contract';

import { describe, expect, it } from '@jest/globals';

describe('MCP access compatibility transport', () => {
  it('conservative read-only default를 제공한다', async () => {
    const access = await mockMcpAccessTransport.getComposite('org-default');

    expect(access.organizationPolicy.allowedScopes).toEqual(
      MCP_ACCESS_SCOPES.filter((scope) => scope.endsWith(':read')),
    );
    expect(access.myPolicy.requestedScopes).toEqual(
      access.organizationPolicy.allowedScopes,
    );
    expect(
      access.effectiveScopes.some((scope) => scope.endsWith(':write')),
    ).toBe(false);
  });

  it('organization shrink가 mock user requested scope도 prune하고 re-enable 시 복원하지 않는다', async () => {
    const organizationId = 'org-shrink';
    const initial = await mockMcpAccessTransport.getComposite(organizationId);
    const expanded = await mockMcpAccessTransport.updateOrganizationPolicy(
      organizationId,
      {
        scopes: [...initial.organizationPolicy.allowedScopes, 'wiki:write'],
        expectedRevision: initial.organizationPolicy.revision,
      },
    );
    const requested = await mockMcpAccessTransport.updateMyPolicy(
      organizationId,
      {
        scopes: [...expanded.myPolicy.requestedScopes, 'wiki:write'],
        expectedRevision: expanded.myPolicy.revision,
      },
    );

    const shrunk = await mockMcpAccessTransport.updateOrganizationPolicy(
      organizationId,
      {
        scopes: requested.organizationPolicy.allowedScopes.filter(
          (scope) => scope !== 'wiki:write',
        ),
        expectedRevision: requested.organizationPolicy.revision,
      },
    );
    expect(shrunk.myPolicy.requestedScopes).not.toContain('wiki:write');

    const reenabled = await mockMcpAccessTransport.updateOrganizationPolicy(
      organizationId,
      {
        scopes: [...shrunk.organizationPolicy.allowedScopes, 'wiki:write'],
        expectedRevision: shrunk.organizationPolicy.revision,
      },
    );
    expect(reenabled.myPolicy.requestedScopes).not.toContain('wiki:write');
  });

  it('stale revision은 명시적 conflict로 실패한다', async () => {
    await expect(
      mockMcpAccessTransport.updateMyPolicy('org-conflict', {
        scopes: [],
        expectedRevision: 99,
      }),
    ).rejects.toMatchObject({
      status: 409,
      errorCode: 'MCP_POLICY_REVISION_CONFLICT',
    });
  });

  it('compat response schema는 canonical scope 밖 값을 거부한다', () => {
    const parsed = McpAccessCompositeSchema.safeParse({
      organizationId: 'org',
      organizationPolicy: {
        allowedScopes: ['wiki:admin'],
        revision: 0,
        updatedAt: new Date().toISOString(),
      },
      myPolicy: {
        requestedScopes: [],
        revision: 0,
        updatedAt: new Date().toISOString(),
      },
      effectiveScopes: [],
      canManageOrganizationPolicy: false,
      capabilities: [],
    });

    expect(parsed.success).toBe(false);
  });
});
