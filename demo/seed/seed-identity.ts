import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { ApiError, ApiSession, created, ignored } from '#seed/api.ts';
import type { SeedContext } from '#seed/context.ts';
import { readAvatar, type UsersFile } from '#seed/source.ts';

const signedUp = z.object({ user: z.object({ id: z.string() }) });
const organizationCreated = z.object({
  organization: z.object({ id: z.string() }),
});

export async function seedIdentity(input: {
  apiUrl: string;
  context: SeedContext;
  demoPassword: string;
  file: UsersFile;
}): Promise<void> {
  const { context, file } = input;

  for (const user of file.users) {
    const session = new ApiSession(input.apiUrl);
    let userId: string;
    try {
      const result = await session.post(
        '/api/auth/sign-up/email',
        {
          name: user.name,
          username: user.username,
          email: user.email,
          // 데모 계정 말고는 로그인할 일이 없어서 버리는 비밀번호를 준다.
          password:
            user.username === file.demoUsername
              ? input.demoPassword
              : randomBytes(24).toString('base64url'),
        },
        signedUp,
      );
      userId = result.user.id;
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        throw new Error(
          `${user.username} 계정을 만들지 못했습니다. 이미 시드한 서버라면 데이터를 비운 뒤 다시 실행해 주세요.`,
          { cause: error },
        );
      }
      throw error;
    }
    await session.putBinary(
      '/users/me/avatar',
      await readAvatar(user.avatar),
      'image/webp',
    );
    context.addUser(user.username, userId, session);
  }
  console.log(`사용자 ${file.users.length}명을 만들었습니다.`);

  for (const organization of file.organizations) {
    const members = file.users.flatMap((user) =>
      user.memberships
        .filter((membership) => membership.organization === organization.slug)
        .map((membership) => ({
          username: user.username,
          role: membership.role,
        })),
    );
    const owners = members.filter((member) => member.role === 'owner');
    const [owner] = owners;
    if (!owner || owners.length !== 1) {
      throw new Error(
        `조직에는 소유자가 한 명이어야 합니다: ${organization.slug}`,
      );
    }

    const ownerSession = context.session(owner.username);
    const result = await ownerSession.post(
      '/organizations',
      organization,
      organizationCreated,
    );
    const organizationId = result.organization.id;
    context.addOrganization(organization.slug, organizationId);

    for (const member of members) {
      if (member.role === 'owner') continue;
      const invitation = await ownerSession.post(
        `/organizations/${organizationId}/invitations`,
        { recipientUsername: member.username, role: member.role },
        created,
      );
      await context
        .session(member.username)
        .post(`/invitations/${invitation.id}/accept`, undefined, ignored);
    }
    console.log(
      `조직 ${organization.name}에 멤버 ${members.length}명을 넣었습니다.`,
    );
  }
}

// 채널과 일대일 대화는 만드는 사람이 지금 보고 있는 조직의 멤버끼리만 만들 수 있다.
export async function activateOrganization(
  context: SeedContext,
  file: UsersFile,
  slug: string,
): Promise<void> {
  const organizationId = context.organizationId(slug);
  for (const user of file.users) {
    if (!user.memberships.some((item) => item.organization === slug)) continue;
    await context
      .session(user.username)
      .put('/organizations/active', { organizationId }, ignored);
  }
}
