import type { INestApplication } from '@nestjs/common';

import type { Auth } from '#server-source/auth/auth';
import {
  authOptions,
  organizationFacadeDisabledPaths,
} from '#server-source/auth/auth-options';
import {
  account,
  invitation,
  member,
  organization,
  session,
  user,
  verification,
} from '#server-source/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '#server-source/database/database.service';
import { createOpenApiDocument, setupOpenApi } from '#server-source/openapi';
import { OrganizationRoleSchema } from '#server-source/organizations/domain/organization-role';
import { OrganizationProvider } from '#server-source/organizations/infrastructure/organization/organization.provider';

import { jest } from '@jest/globals';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';

import { createAppTestingModule } from '#server-test/support/app-testing-module.js';

type TestAgent = ReturnType<typeof request.agent>;

interface TestUser {
  agent: TestAgent;
  userId: string;
}

describe('조직과 멤버 E2E', () => {
  let app: INestApplication;
  let database: DatabaseService['db'];
  let auth: Auth;

  beforeAll(async () => {
    const moduleFixture = await createAppTestingModule().compile();

    app = moduleFixture.createNestApplication({
      bodyParser: false,
    });
    setupOpenApi(app);
    await app.init();
    database = app.get(DatabaseService).db;
    auth = app.get<AuthService<Auth>>(AuthService).instance;
  });

  beforeEach(async () => {
    await database.delete(invitation);
    await database.delete(member);
    await database.delete(session);
    await database.delete(account);
    await database.delete(organization);
    await database.delete(verification);
    await database.delete(user);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createUser(key: string): Promise<TestUser> {
    const agent = request
      .agent(app.getHttpServer())
      .set('Origin', process.env.BETTER_AUTH_URL!);
    const response = await agent.post('/api/auth/sign-up/email').send({
      email: `${key}@example.com`,
      name: `${key} 사용자`,
      password: 'StrongPassword123!',
      username: key.replaceAll('-', ''),
    });

    expect(response.status).toBe(200);
    return {
      agent,
      userId: response.body.user.id as string,
    };
  }

  async function createOrganization(
    actor: TestUser,
    slug: string,
  ): Promise<string> {
    const response = await actor.agent.post('/organizations').send({
      name: `${slug} 조직`,
      slug,
    });

    expect(response.status).toBe(201);
    expect(response.body.organization.slug).toBe(slug);
    expect(response.body.role).toBe(OrganizationRoleSchema.enum.owner);
    return response.body.organization.id as string;
  }

  async function addMember(
    organizationId: string,
    userId: string,
    role: (typeof OrganizationRoleSchema.enum)[keyof typeof OrganizationRoleSchema.enum],
  ): Promise<string> {
    const created = await auth.api.addMember({
      body: {
        organizationId,
        role,
        userId,
      },
    });

    expect(created).toBeTruthy();
    return created!.id;
  }

  it('Organization OpenAPI가 같은 Standard Schema contract를 노출한다', async () => {
    const document = createOpenApiDocument(app);
    const response = await request(app.getHttpServer()).get('/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(document);
    const createOperation = document.paths['/organizations']?.post;
    const listMembersOperation =
      document.paths['/organizations/{organizationId}/members']?.get;

    expect(createOperation?.requestBody).toBeDefined();
    expect(createOperation?.responses['201']).toEqual(
      expect.objectContaining({
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/OrganizationAccess' },
          },
        },
      }),
    );
    expect(JSON.stringify(createOperation?.requestBody)).toContain('"slug"');
    expect(
      JSON.stringify(document.components?.schemas?.OrganizationAccess),
    ).toContain('"organization"');
    expect(JSON.stringify(listMembersOperation?.parameters)).toContain(
      '"limit"',
    );
    expect(JSON.stringify(listMembersOperation?.parameters)).toContain(
      '"search"',
    );
    expect(JSON.stringify(listMembersOperation?.parameters)).toContain(
      '"role"',
    );
    expect(
      JSON.stringify(document.components?.schemas?.OrganizationMemberList),
    ).toContain('"items"');
  });

  it('raw Better Auth Organization HTTP facade는 막고 programmatic API는 유지한다', async () => {
    for (const path of organizationFacadeDisabledPaths) {
      await request(app.getHttpServer())
        .get(`${authOptions.basePath}${path}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`${authOptions.basePath}${path}`)
        .send({})
        .expect(404);
    }

    const actor = await createUser('programmatic-owner');
    const created = await auth.api.createOrganization({
      body: {
        name: 'Programmatic 조직',
        slug: 'programmatic-org',
        userId: actor.userId,
      },
    });

    expect(created?.slug).toBe('programmatic-org');
  });

  it('조직 생성/목록/상세/active 전환을 실제 session 기준으로 처리한다', async () => {
    const actor = await createUser('organization-owner');
    const firstId = await createOrganization(actor, 'first-org');
    const secondId = await createOrganization(actor, 'second-org');

    const listResponse = await actor.agent.get('/organizations');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(2);

    const activeAfterCreate = await actor.agent.get('/organizations/active');
    expect(activeAfterCreate.status).toBe(200);
    expect(activeAfterCreate.body.activeOrganization.organization.id).toBe(
      secondId,
    );

    const switchResponse = await actor.agent.put('/organizations/active').send({
      organizationId: firstId,
    });
    expect(switchResponse.status).toBe(200);
    expect(switchResponse.body.activeOrganization.organization.id).toBe(
      firstId,
    );

    const detailOfNonActiveOrganization = await actor.agent.get(
      `/organizations/${secondId}`,
    );
    expect(detailOfNonActiveOrganization.status).toBe(200);
    expect(detailOfNonActiveOrganization.body.organization.id).toBe(secondId);

    const clearResponse = await actor.agent.put('/organizations/active').send({
      organizationId: null,
    });
    expect(clearResponse.status).toBe(200);
    expect(clearResponse.body.activeOrganization).toBeNull();

    const activeAfterClear = await actor.agent.get('/organizations/active');
    expect(activeAfterClear.status).toBe(200);
    expect(activeAfterClear.body.activeOrganization).toBeNull();
  });

  it('인증되지 않은 요청과 다른 조직 사용자의 상세 접근을 차단한다', async () => {
    const unauthenticated = await request(app.getHttpServer()).get(
      '/organizations',
    );
    expect(unauthenticated.status).toBe(401);

    const owner = await createUser('access-owner');
    const outsider = await createUser('access-outsider');
    const organizationId = await createOrganization(owner, 'access-org');

    const outsiderResponse = await outsider.agent.get(
      `/organizations/${organizationId}`,
    );
    expect(outsiderResponse.status).toBe(404);
    expect(outsiderResponse.body.errorCode).toBe('ORGANIZATION_NOT_FOUND');
  });

  it('DTO validation과 slug conflict를 공용 error envelope로 반환한다', async () => {
    const actor = await createUser('validation-owner');
    await createOrganization(actor, 'unique-org');

    const invalidResponse = await actor.agent.post('/organizations').send({
      name: '',
      slug: 'Invalid Slug',
    });
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.status).toBe(400);
    expect(invalidResponse.body.errors).toBeInstanceOf(Array);
    expect(invalidResponse.headers['content-type']).toContain(
      'application/problem+json',
    );

    const conflictResponse = await actor.agent.post('/organizations').send({
      name: '중복 조직',
      slug: 'unique-org',
    });
    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.body.errorCode).toBe('ORGANIZATION_SLUG_CONFLICT');
  });

  it('member 목록과 role 변경은 target organization 범위와 Better Auth 권한을 따른다', async () => {
    const owner = await createUser('member-owner');
    const ordinaryMember = await createUser('ordinary-member');
    const secondMember = await createUser('second-member');
    const foreignMember = await createUser('foreign-member');
    const organizationId = await createOrganization(owner, 'member-org');
    const foreignOrganizationId = await createOrganization(
      owner,
      'foreign-org',
    );

    const ordinaryMemberId = await addMember(
      organizationId,
      ordinaryMember.userId,
      OrganizationRoleSchema.enum.member,
    );
    const secondMemberId = await addMember(
      organizationId,
      secondMember.userId,
      OrganizationRoleSchema.enum.member,
    );
    const foreignMemberId = await addMember(
      foreignOrganizationId,
      foreignMember.userId,
      OrganizationRoleSchema.enum.member,
    );

    const listResponse = await owner.agent.get(
      `/organizations/${organizationId}/members?limit=2&offset=0`,
    );
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(2);
    expect(listResponse.body.total).toBe(3);

    const searchResponse = await owner.agent.get(
      `/organizations/${organizationId}/members?search=ordinarymember`,
    );
    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.total).toBe(1);
    expect(searchResponse.body.items).toHaveLength(1);
    expect(searchResponse.body.items[0].userId).toBe(ordinaryMember.userId);

    const roleFilterResponse = await owner.agent.get(
      `/organizations/${organizationId}/members?role=member`,
    );
    expect(roleFilterResponse.status).toBe(200);
    expect(roleFilterResponse.body.total).toBe(2);
    expect(roleFilterResponse.body.items).toHaveLength(2);

    const invalidRoleResponse = await owner.agent.get(
      `/organizations/${organizationId}/members?role=guest`,
    );
    expect(invalidRoleResponse.status).toBe(400);

    const blankSearchResponse = await owner.agent.get(
      `/organizations/${organizationId}/members?search=%20%20`,
    );
    expect(blankSearchResponse.status).toBe(400);

    const memberForbiddenResponse = await secondMember.agent
      .patch(
        `/organizations/${organizationId}/members/${ordinaryMemberId}/role`,
      )
      .send({ role: OrganizationRoleSchema.enum.member });
    expect(memberForbiddenResponse.status).toBe(403);
    expect(memberForbiddenResponse.body.errorCode).toBe(
      'ORGANIZATION_ACCESS_DENIED',
    );

    const promoteResponse = await owner.agent
      .patch(
        `/organizations/${organizationId}/members/${ordinaryMemberId}/role`,
      )
      .send({ role: OrganizationRoleSchema.enum.admin });
    expect(promoteResponse.status).toBe(200);
    expect(promoteResponse.body.role).toBe(OrganizationRoleSchema.enum.admin);

    const adminUpdateResponse = await ordinaryMember.agent
      .patch(`/organizations/${organizationId}/members/${secondMemberId}/role`)
      .send({ role: OrganizationRoleSchema.enum.admin });
    expect(adminUpdateResponse.status).toBe(200);
    expect(adminUpdateResponse.body.role).toBe(
      OrganizationRoleSchema.enum.admin,
    );

    const foreignTargetResponse = await owner.agent
      .patch(`/organizations/${organizationId}/members/${foreignMemberId}/role`)
      .send({ role: OrganizationRoleSchema.enum.admin });
    expect(foreignTargetResponse.status).toBe(404);
    expect(foreignTargetResponse.body.errorCode).toBe(
      'ORGANIZATION_MEMBER_NOT_FOUND',
    );
  });

  it('generic member API에서 owner 감소와 self role change를 차단한다', async () => {
    const owner = await createUser('owner-invariant');
    const secondOwner = await createUser('second-owner');
    const organizationId = await createOrganization(
      owner,
      'owner-invariant-org',
    );
    const secondOwnerMemberId = await addMember(
      organizationId,
      secondOwner.userId,
      OrganizationRoleSchema.enum.owner,
    );

    const demoteOwnerResponse = await owner.agent
      .patch(
        `/organizations/${organizationId}/members/${secondOwnerMemberId}/role`,
      )
      .send({ role: OrganizationRoleSchema.enum.admin });
    expect(demoteOwnerResponse.status).toBe(409);
    expect(demoteOwnerResponse.body.errorCode).toBe('OWNER_TRANSFER_REQUIRED');

    const removeOwnerResponse = await owner.agent.delete(
      `/organizations/${organizationId}/members/${secondOwnerMemberId}`,
    );
    expect(removeOwnerResponse.status).toBe(409);
    expect(removeOwnerResponse.body.errorCode).toBe('OWNER_TRANSFER_REQUIRED');

    const [ownerMember] = await database
      .select()
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, owner.userId),
        ),
      );

    const selfRoleResponse = await owner.agent
      .patch(`/organizations/${organizationId}/members/${ownerMember!.id}/role`)
      .send({ role: OrganizationRoleSchema.enum.admin });
    expect(selfRoleResponse.status).toBe(409);
    expect(selfRoleResponse.body.errorCode).toBe(
      'SELF_ROLE_CHANGE_NOT_SUPPORTED',
    );
  });

  it('동일 non-owner role 변경이 동시에 들어와도 완전한 role 상태로 수렴한다', async () => {
    const owner = await createUser('concurrent-role-owner');
    const targetUser = await createUser('concurrent-role-target');
    const organizationId = await createOrganization(
      owner,
      'concurrent-role-org',
    );
    const targetMemberId = await addMember(
      organizationId,
      targetUser.userId,
      OrganizationRoleSchema.enum.member,
    );

    const responses = await Promise.all([
      owner.agent
        .patch(
          `/organizations/${organizationId}/members/${targetMemberId}/role`,
        )
        .send({ role: OrganizationRoleSchema.enum.admin }),
      owner.agent
        .patch(
          `/organizations/${organizationId}/members/${targetMemberId}/role`,
        )
        .send({ role: OrganizationRoleSchema.enum.admin }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);

    const [storedMember] = await database
      .select()
      .from(member)
      .where(eq(member.id, targetMemberId));
    expect(storedMember?.role).toBe(OrganizationRoleSchema.enum.admin);
  });

  it('서로 다른 owner의 동시 감소 요청을 모두 차단해 owner invariant를 유지한다', async () => {
    const firstOwner = await createUser('concurrent-first-owner');
    const secondOwner = await createUser('concurrent-second-owner');
    const organizationId = await createOrganization(
      firstOwner,
      'concurrent-owner-org',
    );
    const secondOwnerMemberId = await addMember(
      organizationId,
      secondOwner.userId,
      OrganizationRoleSchema.enum.owner,
    );
    const [firstOwnerMember] = await database
      .select()
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, firstOwner.userId),
        ),
      );

    const [removeResponse, demoteResponse] = await Promise.all([
      firstOwner.agent.delete(
        `/organizations/${organizationId}/members/${secondOwnerMemberId}`,
      ),
      secondOwner.agent
        .patch(
          `/organizations/${organizationId}/members/${firstOwnerMember!.id}/role`,
        )
        .send({ role: OrganizationRoleSchema.enum.admin }),
    ]);

    expect(removeResponse.status).toBe(409);
    expect(removeResponse.body.errorCode).toBe('OWNER_TRANSFER_REQUIRED');
    expect(demoteResponse.status).toBe(409);
    expect(demoteResponse.body.errorCode).toBe('OWNER_TRANSFER_REQUIRED');

    const storedOwners = await database
      .select()
      .from(member)
      .where(eq(member.organizationId, organizationId));
    expect(
      storedOwners.filter(
        ({ role }) => role === OrganizationRoleSchema.enum.owner,
      ),
    ).toHaveLength(2);
  });

  it('동일 non-owner에 동시 삭제가 들어와도 최종 membership은 제거된다', async () => {
    const owner = await createUser('concurrent-remove-owner');
    const removableMember = await createUser('concurrent-removable-member');
    const organizationId = await createOrganization(
      owner,
      'concurrent-remove-org',
    );
    const removableMemberId = await addMember(
      organizationId,
      removableMember.userId,
      OrganizationRoleSchema.enum.member,
    );

    const responses = await Promise.all([
      owner.agent.delete(
        `/organizations/${organizationId}/members/${removableMemberId}`,
      ),
      owner.agent.delete(
        `/organizations/${organizationId}/members/${removableMemberId}`,
      ),
    ]);

    const statuses = responses.map(({ status }) => status);
    expect(statuses).toContain(204);
    expect(statuses.every((status) => status === 204 || status === 404)).toBe(
      true,
    );

    const storedMembers = await database
      .select()
      .from(member)
      .where(eq(member.id, removableMemberId));
    expect(storedMembers).toHaveLength(0);
  });

  it('generic self removal을 차단하고 remove 재요청은 not-found를 반환한다', async () => {
    const owner = await createUser('remove-owner');
    const selfRemovingMember = await createUser('self-removing-member');
    const removableMember = await createUser('removable-member');
    const organizationId = await createOrganization(owner, 'remove-org');
    const selfRemovingMemberId = await addMember(
      organizationId,
      selfRemovingMember.userId,
      OrganizationRoleSchema.enum.member,
    );
    const removableMemberId = await addMember(
      organizationId,
      removableMember.userId,
      OrganizationRoleSchema.enum.member,
    );

    const selfRemoveResponse = await selfRemovingMember.agent.delete(
      `/organizations/${organizationId}/members/${selfRemovingMemberId}`,
    );
    expect(selfRemoveResponse.status).toBe(409);
    expect(selfRemoveResponse.body.errorCode).toBe(
      'SELF_MEMBER_REMOVAL_NOT_SUPPORTED',
    );

    await owner.agent
      .delete(`/organizations/${organizationId}/members/${removableMemberId}`)
      .expect(204);

    const repeatedDelete = await owner.agent.delete(
      `/organizations/${organizationId}/members/${removableMemberId}`,
    );
    expect(repeatedDelete.status).toBe(404);
    expect(repeatedDelete.body.errorCode).toBe('ORGANIZATION_MEMBER_NOT_FOUND');

    const selfMembership = await database
      .select()
      .from(member)
      .where(eq(member.id, selfRemovingMemberId));
    expect(selfMembership).toHaveLength(1);
  });
  it('쿠키 인증 변경 요청의 미허용 Origin과 누락된 Origin을 거절한다', async () => {
    const actor = await createUser('origin-guard');
    const forbidden = await actor.agent
      .post('/organizations')
      .set('Origin', 'https://untrusted.example')
      .type('form')
      .send({ name: '금지된 조직', slug: 'forbidden-origin' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers['content-type']).toContain(
      'application/problem+json',
    );
    const missing = await actor.agent
      .post('/organizations')
      .unset('Origin')
      .send({ name: '출처 없는 조직', slug: 'missing-origin' });
    expect(missing.status).toBe(403);
    const list = await actor.agent.get('/organizations');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('Better Auth 오류도 RFC 9457로 반환하고 공급자 코드를 보존한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: 'absent@example.com', password: 'StrongPassword123!' });
    expect(response.status).toBe(401);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.body).toMatchObject({
      status: 401,
      type: 'about:blank',
      errorCode: 'INVALID_EMAIL_OR_PASSWORD',
    });
    const disabled = await request(app.getHttpServer())
      .post(`${authOptions.basePath}${organizationFacadeDisabledPaths[0]}`)
      .send({});
    expect(disabled.status).toBe(404);
    expect(disabled.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(disabled.body.status).toBe(404);
  });

  it.each(['삭제', '강등'] as const)(
    '사전 조회 후 owner로 승격된 대상의 %s 요청을 실제 쓰기에서 거절한다',
    async (operation) => {
      const actor = await createUser('race-owner');
      const targetUser = await createUser('race-target');
      const organizationId = await createOrganization(actor, 'race-org');
      const targetId = await addMember(
        organizationId,
        targetUser.userId,
        OrganizationRoleSchema.enum.member,
      );
      const provider = app.get(OrganizationProvider);
      const getMember = provider.getMember.bind(provider);
      let entered = () => {};
      let release = () => {};
      const waiting = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const paused = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = jest
        .spyOn(provider, 'getMember')
        .mockImplementationOnce(async (...args) => {
          const target = await getMember(...args);
          entered();
          await paused;
          return target;
        });
      const path = `/organizations/${organizationId}/members/${targetId}`;
      const mutation = (
        operation === '삭제'
          ? actor.agent.delete(path)
          : actor.agent.patch(`${path}/role`).send({ role: 'admin' })
      ).then((response) => response);
      try {
        await waiting;
        const promotion = await actor.agent
          .patch(`${path}/role`)
          .send({ role: 'owner' });
        expect(promotion.status).toBe(200);
        expect(promotion.body.role).toBe('owner');
      } finally {
        release();
        spy.mockRestore();
      }
      const response = await mutation;
      expect(response.status).toBe(409);
      expect(response.body.errorCode).toBe('OWNER_TRANSFER_REQUIRED');
      const [stored] = await database
        .select()
        .from(member)
        .where(eq(member.id, targetId));
      expect(stored?.role).toBe('owner');
    },
  );
});
