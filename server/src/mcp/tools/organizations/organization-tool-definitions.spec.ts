import { MCP_SCOPES } from '@/mcp/contracts/mcp-scope';
import { organizationToolDefinitions } from '@/mcp/tools/organizations/organization-tool-definitions';

describe('Organizations MCP tool 정의', () => {
  it('v1 조직 tool 세 개의 이름과 scope를 고정한다', () => {
    expect(
      organizationToolDefinitions.map(({ name, requiredScope }) => ({
        name,
        requiredScope,
      })),
    ).toEqual([
      { name: 'organizations_list', requiredScope: 'organizations:read' },
      {
        name: 'organization_members_list',
        requiredScope: 'organizations:read',
      },
      {
        name: 'organization_invitation_create',
        requiredScope: 'organizations:write',
      },
    ]);

    for (const tool of organizationToolDefinitions) {
      expect(MCP_SCOPES).toContain(tool.requiredScope);
    }
  });

  it('모든 input/output은 top-level object schema다', () => {
    for (const tool of organizationToolDefinitions) {
      expect(tool.inputSchema.def.type).toBe('object');
      expect(tool.outputSchema.def.type).toBe('object');
    }
  });

  it('멤버 목록 input은 기존 pagination bound를 재사용한다', () => {
    const members = organizationToolDefinitions[1];

    expect(
      members.inputSchema.parse({
        organizationId: 'org-a',
        limit: 100,
        offset: 0,
      }),
    ).toMatchObject({
      organizationId: 'org-a',
      limit: 100,
      offset: 0,
    });

    expect(() =>
      members.inputSchema.parse({
        organizationId: 'org-a',
        limit: 101,
        offset: 0,
      }),
    ).toThrow();
  });

  it('초대 생성은 consequential write로 명시한다', () => {
    const invitation = organizationToolDefinitions[2];

    expect(invitation.classification).toBe('consequential');
    expect(invitation.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });
});
