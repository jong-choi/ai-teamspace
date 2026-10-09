import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';

import type { Auth } from '@/auth/auth';
import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '@/database/database.service';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { setupOpenApi } from '@/openapi';

import { createAppTestingModule } from '@test/support/app-testing-module';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { inArray, like } from 'drizzle-orm';
import request from 'supertest';

export type TestAgent = ReturnType<typeof request.agent>;

export interface TestUser {
  agent: TestAgent;
  userId: string;
  sessionCookie: string;
}

const inertSemanticEmbedder = {
  async embedDocuments() {
    return [];
  },
  async embedQuery() {
    return [];
  },
  asLangchainEmbeddings() {
    return {
      embedDocuments: async () => [],
      embedQuery: async () => [],
    };
  },
};

/** 이 suite가 만든 사용자·조직 이름 접두사다. 정리는 이 접두사 범위만 지운다. */
export function createRunPrefix(label: string): string {
  return `kg-p8-${label}-${randomUUID().slice(0, 8)}`;
}

export class KnowledgeGraphHttpFixture {
  private constructor(
    readonly app: INestApplication,
    readonly prefix: string,
  ) {}

  static async boot(
    prefix: string,
    configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (
      builder,
    ) => builder,
  ): Promise<KnowledgeGraphHttpFixture> {
    const builder = createAppTestingModule()
      .overrideProvider(SemanticEmbedder)
      .useValue(inertSemanticEmbedder);
    const moduleRef = await configure(builder).compile();
    const app = moduleRef.createNestApplication({ bodyParser: false });
    setupOpenApi(app);
    await app.init();
    return new KnowledgeGraphHttpFixture(app, prefix);
  }

  get database(): DatabaseService['db'] {
    return this.app.get(DatabaseService).db;
  }

  get auth(): Auth {
    return this.app.get<AuthService<Auth>>(AuthService).instance;
  }

  anonymous(): TestAgent {
    return request
      .agent(this.app.getHttpServer())
      .set('Origin', process.env.BETTER_AUTH_URL!);
  }

  async createUser(key: string): Promise<TestUser> {
    const agent = this.anonymous();
    const name = `${this.prefix}-${key}`;
    const response = await agent.post('/api/auth/sign-up/email').send({
      email: `${name}@example.com`,
      name: `${name} 사용자`,
      password: 'StrongPassword123!',
      username: `kg${randomUUID().replaceAll('-', '').slice(0, 20)}`,
    });
    if (response.status !== 200)
      throw new Error(`테스트 사용자 생성 실패: ${response.status}`);
    const sessionCookie = toCookieHeader(response.headers['set-cookie']);
    agent.set('Cookie', sessionCookie);
    return {
      agent,
      userId: response.body.user.id as string,
      sessionCookie,
    };
  }

  async createOrganization(actor: TestUser, key: string): Promise<string> {
    const slug = `${this.prefix}-${key}`;
    const response = await actor.agent
      .post('/organizations')
      .send({ name: `${slug} 조직`, slug });
    if (response.status !== 201)
      throw new Error(`테스트 조직 생성 실패: ${response.status}`);
    return response.body.organization.id as string;
  }

  async addMember(
    organizationId: string,
    userId: string,
    role: 'owner' | 'admin' | 'member',
  ): Promise<void> {
    await this.auth.api.addMember({ body: { organizationId, userId, role } });
  }

  async createWikiDocument(
    actor: TestUser,
    organizationId: string,
    input: { title: string; contentMarkdown?: string },
  ): Promise<{ id: string; updatedAt: string }> {
    const response = await actor.agent
      .post(`/organizations/${organizationId}/wiki/documents`)
      .send(input);
    if (response.status !== 201)
      throw new Error(`테스트 문서 생성 실패: ${response.status}`);
    return response.body as { id: string; updatedAt: string };
  }

  /** 이 접두사의 조직과 사용자만 지운다. 다른 suite 데이터는 건드리지 않는다. */
  async cleanup(): Promise<void> {
    const organizations = await this.database
      .select({ id: organization.id })
      .from(organization)
      .where(like(organization.slug, `${this.prefix}-%`));
    if (organizations.length > 0)
      await this.database.delete(organization).where(
        inArray(
          organization.id,
          organizations.map(({ id }) => id),
        ),
      );
    await this.database
      .delete(user)
      .where(like(user.email, `${this.prefix}-%`));
  }

  async close(): Promise<void> {
    try {
      await this.cleanup();
    } finally {
      await this.app.close();
    }
  }

  authenticated(sessionCookie: string): TestAgent {
    return this.anonymous().set('Cookie', sessionCookie);
  }

  async shutdown(): Promise<void> {
    await this.app.close();
  }
}

export function refreshPath(organizationId: string, documentId: string) {
  return `/organizations/${organizationId}/wiki/documents/${documentId}/knowledge-graph/refresh`;
}

export function statusPath(organizationId: string, documentId: string) {
  return `/organizations/${organizationId}/wiki/documents/${documentId}/knowledge-graph/status`;
}

function toCookieHeader(value: string | string[] | undefined): string {
  if (!value) throw new Error('테스트 로그인 응답에 세션 쿠키가 없습니다.');
  return (Array.isArray(value) ? value : [value])
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ');
}
