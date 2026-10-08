import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';

import {
  authOptions,
  organizationFacadeDisabledPaths,
} from '@/auth/auth-options';

import { createAppTestingModule } from '@test/support/app-testing-module';
import request from 'supertest';

type App = Parameters<typeof request>[0];

describe('앱 컨트롤러 E2E', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule =
      await createAppTestingModule().compile();

    app = moduleFixture.createNestApplication({
      bodyParser: false,
    });
    await app.init();
  });

  it('GET / 요청에 Hello World!를 반환한다', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('Better Auth 비활성 경로 오류도 custom plugin을 거쳐 RFC 9457로 반환한다', async () => {
    const response = await request(app.getHttpServer()).post(
      `${authOptions.basePath}${organizationFacadeDisabledPaths[0]}`,
    );

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
    });
  });

  it('JSON body가 전역 parser 제한을 넘으면 500이 아니라 413 Problem Details를 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/organizations')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(200_000) }));

    expect(response.status).toBe(413);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.body).toMatchObject({ status: 413 });
  });

  afterEach(async () => {
    await app.close();
  });
});
