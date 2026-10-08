import { OrganizationProvider } from '@/organizations/infrastructure/organization/organization.provider';
import { MembershipProjectionQueryService } from '@/organizations/membership-projection-query.service';

import { McpIntegrationApp } from '@test/support/mcp-integration.fixture';

describe('Better Auth 공개 membership 투영 조회', () => {
  let target: McpIntegrationApp;
  let query: MembershipProjectionQueryService;

  beforeAll(async () => {
    target = await McpIntegrationApp.start();
    query = new MembershipProjectionQueryService(
      target.app.get(OrganizationProvider),
    );
  });

  afterEach(async () => {
    await target.cleanupActors();
  });
  afterAll(async () => {
    await target?.close();
  });

  it('조직 범위와 cursor를 유지하고 현재 역할 변경 및 탈퇴를 다시 읽는다', async () => {
    const owner = await target.createActor({ scopes: ['wiki:read'] });
    const other = await target.createActor({ scopes: ['wiki:read'] });
    const member = await target.addMember(owner, { scopes: ['wiki:read'] });

    expect(
      await query.current(owner.organizationId, member.userId),
    ).toMatchObject({
      id: member.memberId,
      organizationId: owner.organizationId,
      userId: member.userId,
      role: 'member',
    });
    expect(await query.current(other.organizationId, member.userId)).toBeNull();
    const first = await query.listUserIds(owner.organizationId, null, 1);
    expect(first).toHaveLength(1);
    const second = await query.listUserIds(owner.organizationId, first[0], 1);
    expect(second).toHaveLength(1);
    expect([...first, ...second]).toEqual(
      expect.arrayContaining([owner.userId, member.userId]),
    );
    expect(await query.listUserIds(owner.organizationId, second[0], 1)).toEqual(
      [],
    );

    await owner.agent
      .patch(
        `/organizations/${owner.organizationId}/members/${member.memberId}/role`,
      )
      .send({ role: 'admin' })
      .expect(200);
    expect(
      await query.current(owner.organizationId, member.userId),
    ).toMatchObject({ role: 'admin' });
    await owner.agent
      .delete(
        `/organizations/${owner.organizationId}/members/${member.memberId}`,
      )
      .expect(204);
    expect(await query.current(owner.organizationId, member.userId)).toBeNull();
    expect(await query.listUserIds(owner.organizationId, null, 10)).toEqual([
      owner.userId,
    ]);
  });
});
