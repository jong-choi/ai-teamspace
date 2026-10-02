import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '#server-source/app.module';
import type { Auth } from '#server-source/auth/auth';
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

import { AuthService } from '@thallesp/nestjs-better-auth';
import { eq } from 'drizzle-orm';
import request from 'supertest';

describe('Better Auth Drizzle 통합', () => {
  let app: INestApplication;
  let database: DatabaseService['db'];
  let auth: Auth;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({
      bodyParser: false,
    });
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

  it('Nest HTTP 경로에서 Better Auth 회원가입을 처리한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({
        email: 'http-worker@example.com',
        name: 'HTTP 테스트 사용자',
        password: 'StrongPassword123!',
        username: 'httpworker',
      });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.user.username).toBe('httpworker');

    const [storedUser] = await database
      .select()
      .from(user)
      .where(eq(user.email, 'http-worker@example.com'));

    expect(storedUser?.username).toBe('httpworker');
  });

  it('아이디/비밀번호 계정과 세션, 조직 owner 멤버십을 생성한다', async () => {
    const password = 'StrongPassword123!';
    const signedUp = await auth.api.signUpEmail({
      body: {
        email: 'worker@example.com',
        name: '테스트 사용자',
        password,
        username: 'worker01',
      },
    });

    expect(signedUp.user.username).toBe('worker01');

    const [storedUser] = await database
      .select()
      .from(user)
      .where(eq(user.id, signedUp.user.id));
    const [storedAccount] = await database
      .select()
      .from(account)
      .where(eq(account.userId, signedUp.user.id));

    expect(storedUser?.username).toBe('worker01');
    expect(storedAccount?.providerId).toBe('credential');
    expect(storedAccount?.password).toBeTruthy();
    expect(storedAccount?.password).not.toBe(password);

    const signedIn = await auth.api.signInUsername({
      body: {
        username: 'worker01',
        password,
      },
    });

    expect(signedIn.user.id).toBe(signedUp.user.id);

    const storedSessions = await database
      .select()
      .from(session)
      .where(eq(session.userId, signedUp.user.id));

    expect(storedSessions.length).toBeGreaterThan(0);

    const createdOrganization = await auth.api.createOrganization({
      body: {
        name: '테스트 조직',
        slug: 'test-organization',
        userId: signedUp.user.id,
      },
    });

    expect(createdOrganization?.slug).toBe('test-organization');

    const [storedMember] = await database
      .select()
      .from(member)
      .where(eq(member.organizationId, createdOrganization!.id));

    expect(storedMember?.userId).toBe(signedUp.user.id);
    expect(storedMember?.role).toBe('owner');
  });
});
