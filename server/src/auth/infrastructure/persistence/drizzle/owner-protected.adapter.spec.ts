import { authOptions } from '#server/auth/auth-options.js';
import { protectOrganizationOwners } from '#server/auth/infrastructure/persistence/drizzle/owner-protected.adapter.js';
import { OwnerTransferRequiredError } from '#server/organizations/domain/organization.error.js';
import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';

import { memoryAdapter } from 'better-auth/adapters/memory';

describe('조직 owner 쓰기 보호', () => {
  it('write 시점에 owner인 멤버의 강등을 거절한다', async () => {
    const { adapter, members } = createProtectedAdapter();

    await expect(
      adapter.update({
        model: 'member',
        where: [{ field: 'id', value: 'owner-member' }],
        update: { role: OrganizationRoleSchema.enum.admin },
      }),
    ).rejects.toBeInstanceOf(OwnerTransferRequiredError);

    expect(members[0]?.role).toBe(OrganizationRoleSchema.enum.owner);
  });

  it('write 시점에 owner인 멤버의 삭제를 거절한다', async () => {
    const { adapter, members } = createProtectedAdapter();

    await expect(
      adapter.delete({
        model: 'member',
        where: [{ field: 'id', value: 'owner-member' }],
      }),
    ).rejects.toBeInstanceOf(OwnerTransferRequiredError);

    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe(OrganizationRoleSchema.enum.owner);
  });
});

function createProtectedAdapter() {
  const members = [
    {
      id: 'owner-member',
      organizationId: 'organization-a',
      userId: 'owner-user',
      role: OrganizationRoleSchema.enum.owner,
      createdAt: new Date(0),
    },
  ];
  const database = { member: members };
  const adapter = protectOrganizationOwners(
    memoryAdapter(database)(authOptions),
  );

  return { adapter, members };
}
