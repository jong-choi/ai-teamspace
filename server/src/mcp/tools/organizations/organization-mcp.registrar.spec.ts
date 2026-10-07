import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { OrganizationMcpRegistrar } from '@/mcp/tools/organizations/organization-mcp.registrar';
import type { OrganizationInvitationsService } from '@/organizations/organization-invitations.service';
import type { OrganizationsService } from '@/organizations/organizations.service';

const auth: McpAuthContext = {
  authMethod: 'api-key',
  credentialId: 'key-a',
  userId: 'user-a',
  clientId: null,
  scopes: ['organizations:read', 'organizations:write'],
  allowedOrganizationIds: ['org-a'],
};

const allow = async () => undefined;

describe('Organizations MCP registrar', () => {
  const list = jest.fn<
    ReturnType<OrganizationsService['list']>,
    Parameters<OrganizationsService['list']>
  >();
  const listMembers = jest.fn<
    ReturnType<OrganizationsService['listMembers']>,
    Parameters<OrganizationsService['listMembers']>
  >();
  const createInvitation = jest.fn<
    ReturnType<OrganizationInvitationsService['create']>,
    Parameters<OrganizationInvitationsService['create']>
  >();

  const registrar = new OrganizationMcpRegistrar(
    { list, listMembers },
    { create: createInvitation },
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('organizations_list는 actor를 credential user에서 만들고 key grant로 결과를 제한한다', async () => {
    list.mockResolvedValue({
      items: [
        {
          id: 'org-a',
          name: 'A',
          slug: 'a',
          logo: null,
          createdAt: '2026-10-07T00:00:00.000Z',
        },
        {
          id: 'org-b',
          name: 'B',
          slug: 'b',
          logo: null,
          createdAt: '2026-10-07T00:00:00.000Z',
        },
      ],
    });

    const output = await registrar.tools()[0]!.invoke({}, auth, allow);

    expect(list).toHaveBeenCalledWith({ userId: 'user-a' });
    expect(output).toMatchObject({
      items: [{ id: 'org-a' }],
    });
  });

  it('organization_members_list는 ID와 query를 exact service signature로 분리한다', async () => {
    listMembers.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    await registrar.tools()[1]!.invoke(
      {
        organizationId: 'org-a',
        limit: 20,
        offset: 0,
        search: 'kim',
      },
      auth,
      allow,
    );

    expect(listMembers).toHaveBeenCalledWith({ userId: 'user-a' }, 'org-a', {
      limit: 20,
      offset: 0,
      search: 'kim',
    });
  });

  it('organization_invitation_create는 DTO body만 owning service에 전달한다', async () => {
    createInvitation.mockResolvedValue({
      id: 'invitation-a',
      role: 'member',
      status: 'pending',
      expiresAt: '2026-10-09T00:00:00.000Z',
      createdAt: '2026-10-07T00:00:00.000Z',
    });

    const output = await registrar.tools()[2]!.invoke(
      {
        organizationId: 'org-a',
        recipientUsername: 'member-a',
        role: 'member',
      },
      auth,
      allow,
    );

    expect(createInvitation).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      { recipientUsername: 'member-a', role: 'member' },
    );
    expect(output).toMatchObject({
      id: 'invitation-a',
      status: 'pending',
    });
  });
});
