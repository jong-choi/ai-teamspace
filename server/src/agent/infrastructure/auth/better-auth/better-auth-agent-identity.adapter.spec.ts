import type { Auth } from '@/auth/auth';
import { AgentOrganizationContextRequiredError } from '@/agent/infrastructure/auth/agent-identity.provider';
import { BetterAuthAgentIdentityAdapter } from '@/agent/infrastructure/auth/better-auth/better-auth-agent-identity.adapter';
import type { OrganizationMembershipService } from '@/organizations/organization-membership.service';

import { jest } from '@jest/globals';
import type { AuthService } from '@thallesp/nestjs-better-auth';

describe('Better Auth Agent identity adapter', () => {
  test('세션이 없으면 익명 요청으로 처리한다', async () => {
    const { adapter, hasMemberUser } = createSubject(null);

    await expect(
      adapter.resolve(new Request('http://localhost/threads')),
    ).resolves.toBeNull();
    expect(hasMemberUser).not.toHaveBeenCalled();
  });

  test('활성 조직 멤버십을 검증한 actor를 반환한다', async () => {
    const { adapter, hasMemberUser } = createSubject(createSession());

    await expect(
      adapter.resolve(new Request('http://localhost/threads')),
    ).resolves.toEqual({
      userId: 'user-a',
      organizationId: 'organization-a',
      displayName: '사용자 A',
      permissions: [],
    });
    expect(hasMemberUser).toHaveBeenCalledWith('organization-a', 'user-a');
  });

  test('활성 조직이 없으면 조직 context 오류를 반환한다', async () => {
    const { adapter, hasMemberUser } = createSubject(
      createSession({ activeOrganizationId: null }),
    );

    await expect(
      adapter.resolve(new Request('http://localhost/threads')),
    ).rejects.toBeInstanceOf(AgentOrganizationContextRequiredError);
    expect(hasMemberUser).not.toHaveBeenCalled();
  });

  test('활성 조직의 멤버가 아니면 조직 context 오류를 반환한다', async () => {
    const { adapter, hasMemberUser } = createSubject(createSession(), false);

    await expect(
      adapter.resolve(new Request('http://localhost/threads')),
    ).rejects.toBeInstanceOf(AgentOrganizationContextRequiredError);
    expect(hasMemberUser).toHaveBeenCalledWith('organization-a', 'user-a');
  });
});

function createSubject(session: unknown, hasMember = true) {
  const getSession = jest.fn(async () => session);
  const hasMemberUser = jest.fn(async () => hasMember);
  const authService = {
    api: { getSession },
  } as unknown as AuthService<Auth>;
  const memberships = {
    hasMemberUser,
  } as unknown as OrganizationMembershipService;

  return {
    adapter: new BetterAuthAgentIdentityAdapter(authService, memberships),
    getSession,
    hasMemberUser,
  };
}

function createSession(
  sessionOverrides: { activeOrganizationId: string | null } = {
    activeOrganizationId: 'organization-a',
  },
) {
  return {
    session: {
      activeOrganizationId: sessionOverrides.activeOrganizationId,
    },
    user: {
      id: 'user-a',
      name: '사용자 A',
    },
  };
}
