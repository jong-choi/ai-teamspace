import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Auth } from '@/auth/auth';
import { oauthResource } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import type { AllConfigType } from '@/config/config.type';
import { DatabaseService } from '@/database/database.service';

import { createAppTestingModule } from '@test/support/app-testing-module';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { eq } from 'drizzle-orm';
import request from 'supertest';

describe('Better Auth bootstrap 동시 시작과 재시작 통합', () => {
  const started: INestApplication[] = [];

  afterEach(async () => {
    await Promise.all(started.splice(0).map((app) => app.close()));
  });

  it('두 app이 동시에 시작해도 MCP OAuth resource는 하나이고 한 app 종료가 다른 app을 닫지 않으며 재시작한 app도 준비된다', async () => {
    const seed = await startApp();
    const resourceUrl = seed
      .get(ConfigService<AllConfigType>)
      .getOrThrow('mcp', { infer: true }).resourceUrl;
    // 빈 resource 상태에서 두 process가 동시에 seed하는 상황을 만든다.
    await seed
      .get(DatabaseService)
      .db.delete(oauthResource)
      .where(eq(oauthResource.identifier, resourceUrl));
    await closeApp(seed);

    const [first, second] = await Promise.all([startApp(), startApp()]);
    await Promise.all([authReady(first), authReady(second)]);

    const resources = await second
      .get(DatabaseService)
      .db.select({ id: oauthResource.id })
      .from(oauthResource)
      .where(eq(oauthResource.identifier, resourceUrl));
    expect(resources).toHaveLength(1);

    await closeApp(first);
    await expect(metadataStatus(second)).resolves.toBe(200);

    const restarted = await startApp();
    await authReady(restarted);
    await expect(metadataStatus(restarted)).resolves.toBe(200);
  });

  async function startApp(): Promise<INestApplication> {
    const moduleFixture = await createAppTestingModule().compile();
    const app = moduleFixture.createNestApplication({ bodyParser: false });
    await app.init();
    started.push(app);
    return app;
  }

  async function closeApp(app: INestApplication): Promise<void> {
    started.splice(started.indexOf(app), 1);
    await app.close();
  }

  /** Better Auth plugin init(resource seed 포함)이 실패하면 context promise가 거부된다. */
  async function authReady(app: INestApplication): Promise<void> {
    await app.get(AuthService<Auth>).instance.$context;
  }

  async function metadataStatus(app: INestApplication): Promise<number> {
    const response = await request(app.getHttpServer()).get(
      '/.well-known/oauth-protected-resource/mcp',
    );
    return response.status;
  }
});
