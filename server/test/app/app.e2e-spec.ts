import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '#server/app.module.js';
import {
  authOptions,
  organizationFacadeDisabledPaths,
} from '#server/auth/auth-options.js';

import request from 'supertest';
import { App } from 'supertest/types.js';

describe('앱 컨트롤러 E2E', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  afterEach(async () => {
    await app.close();
  });
});
