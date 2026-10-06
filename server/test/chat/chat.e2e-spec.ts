import type { INestApplication } from '@nestjs/common';

import {
  account,
  invitation,
  member,
  organization,
  session,
  user,
  verification,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { chatConversation } from '@/chat/infrastructure/persistence/drizzle/schema/chat-conversation.schema';
import { DatabaseService } from '@/database/database.service';
import { createOpenApiDocument, setupOpenApi } from '@/openapi';

import request from 'supertest';

import { createAppTestingModule } from '@test/support/app-testing-module';

type TestAgent = ReturnType<typeof request.agent>;

type TestUser = {
  agent: TestAgent;
  userId: string;
  username: string;
  cookie: string;
};

describe('채팅 E2E', () => {
  let app: INestApplication;
  let database: DatabaseService['db'];

  beforeAll(async () => {
    const moduleFixture = await createAppTestingModule().compile();

    app = moduleFixture.createNestApplication({
      bodyParser: false,
    });
    setupOpenApi(app);
    await app.init();
    database = app.get(DatabaseService).db;
  });

  beforeEach(async () => {
    await database.delete(chatConversation);
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
    const username = key.replaceAll('-', '');
    const agent = request
      .agent(app.getHttpServer())
      .set('Origin', process.env.BETTER_AUTH_URL!);
    const response = await agent.post('/api/auth/sign-up/email').send({
      email: `${key}@example.com`,
      name: `${key} 사용자`,
      password: 'StrongPassword123!',
      username,
    });

    expect(response.status).toBe(200);
    return {
      agent,
      userId: response.body.user.id as string,
      username,
      cookie: toCookieHeader(response.headers['set-cookie']),
    };
  }

  it('채팅 OpenAPI가 대화, 메시지, 읽음 계약을 노출한다', async () => {
    const document = createOpenApiDocument(app);
    const response = await request(app.getHttpServer()).get('/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(document);

    expect(
      document.paths['/chat/conversations']?.get?.responses['200'],
    ).toBeDefined();
    expect(
      document.paths['/chat/channels']?.post?.responses['201'],
    ).toBeDefined();
    expect(
      document.paths['/chat/direct']?.post?.responses['200'],
    ).toBeDefined();
    expect(
      document.paths['/chat/conversations/{conversationId}/messages']?.get
        ?.responses['200'],
    ).toBeDefined();
    expect(
      document.paths['/chat/conversations/{conversationId}/messages']?.post
        ?.responses['201'],
    ).toBeDefined();
    expect(
      document.paths[
        '/chat/conversations/{conversationId}/messages/{messageId}'
      ]?.patch?.responses['200'],
    ).toBeDefined();
    expect(
      document.paths['/chat/conversations/{conversationId}/read']?.post
        ?.responses['204'],
    ).toBeDefined();
  });

  it('일대일 대화 생성부터 메시지 수정, 참가자 접근, 읽지 않은 상태와 읽음 처리까지 실제 세션으로 처리한다', async () => {
    const actor = await createUser('chat-actor');
    const recipient = await createUser('chat-recipient');
    const outsider = await createUser('chat-outsider');

    const direct = await actor.agent.post('/chat/direct').send({
      recipientUsername: recipient.username,
    });
    expect(direct.status).toBe(200);
    expect(direct.body.kind).toBe('direct');
    expect(direct.body.participants).toHaveLength(2);
    const conversationId = direct.body.id as string;

    const repeated = await actor.agent.post('/chat/direct').send({
      recipientUsername: recipient.username,
    });
    expect(repeated.status).toBe(200);
    expect(repeated.body.id).toBe(conversationId);

    const sent = await actor.agent
      .post(`/chat/conversations/${conversationId}/messages`)
      .send({ text: '안녕하세요' });
    expect(sent.status).toBe(201);
    expect(sent.body.content).toEqual({ type: 'text', text: '안녕하세요' });
    const messageId = sent.body.id as string;

    const recipientList = await recipient.agent.get('/chat/conversations');
    expect(recipientList.status).toBe(200);
    expect(recipientList.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: conversationId, unreadCount: 1 }),
      ]),
    );

    const history = await recipient.agent.get(
      `/chat/conversations/${conversationId}/messages?limit=50`,
    );
    expect(history.status).toBe(200);
    expect(history.body.items).toEqual([
      expect.objectContaining({
        id: messageId,
        content: { type: 'text', text: '안녕하세요' },
      }),
    ]);

    const forbiddenConversation = await outsider.agent.get(
      `/chat/conversations/${conversationId}`,
    );
    expect(forbiddenConversation.status).toBe(404);
    expect(forbiddenConversation.body.errorCode).toBe(
      'CHAT_CONVERSATION_NOT_FOUND',
    );

    const forbiddenEdit = await recipient.agent
      .patch(`/chat/conversations/${conversationId}/messages/${messageId}`)
      .send({ text: '상대가 수정' });
    expect(forbiddenEdit.status).toBe(403);
    expect(forbiddenEdit.body.errorCode).toBe('CHAT_ACCESS_DENIED');

    const edited = await actor.agent
      .patch(`/chat/conversations/${conversationId}/messages/${messageId}`)
      .send({ text: '수정된 메시지' });
    expect(edited.status).toBe(200);
    expect(edited.body.content).toEqual({
      type: 'text',
      text: '수정된 메시지',
    });
    expect(edited.body.editedAt).toEqual(expect.any(String));

    await recipient.agent
      .post(`/chat/conversations/${conversationId}/read`)
      .send({ messageId })
      .expect(204);
    const afterRead = await recipient.agent.get('/chat/conversations');
    expect(afterRead.status).toBe(200);
    expect(afterRead.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: conversationId, unreadCount: 0 }),
      ]),
    );
  });

  it('네이티브 쿠키 요청은 신뢰된 expo-origin으로 변경 요청을 수행한다', async () => {
    const nativeUser = await createUser('chat-native');

    const trusted = await request(app.getHttpServer())
      .post('/chat/channels')
      .set('Cookie', nativeUser.cookie)
      .set('expo-origin', 'monorepoerp://')
      .send({ name: 'Native 채널' });
    expect(trusted.status).toBe(201);
    expect(trusted.body.name).toBe('Native 채널');

    const forbidden = await request(app.getHttpServer())
      .post('/chat/channels')
      .set('Cookie', nativeUser.cookie)
      .set('expo-origin', 'untrusted://')
      .send({ name: '차단 채널' });
    expect(forbidden.status).toBe(403);
  });
});

function toCookieHeader(value: string | string[] | undefined): string {
  if (!value) {
    throw new Error('테스트 로그인 응답에 세션 쿠키가 없습니다.');
  }
  const values = Array.isArray(value) ? value : [value];
  return values.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}
