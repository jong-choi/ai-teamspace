import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import type { INestApplication } from '@nestjs/common';

import {
  account,
  apikey,
  organization,
  session,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '@/database/database.service';
import { WORK_OS_MCP_PROTOCOL_VERSION } from '@/mcp/contracts/mcp-protocol';
import type { McpScope } from '@/mcp/contracts/mcp-scope';

import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createAppTestingModule } from '@test/support/app-testing-module';
import { inArray } from 'drizzle-orm';
import request, { type Response as TestResponse } from 'supertest';

type TestAgent = ReturnType<typeof request.agent>;

const OVERRIDDEN_ENVIRONMENT_KEYS = [
  'BETTER_AUTH_URL',
  'APP_TRUSTED_ORIGINS',
  'MCP_RESOURCE_URL',
  'MCP_ALLOWED_HOSTS',
  'MCP_ALLOWED_ORIGINS',
  'MCP_AGENT_OAUTH_REDIRECT_URL',
] as const;

export interface McpActor {
  agent: TestAgent;
  userId: string;
  organizationId: string;
  keyId: string;
  secret: string;
  userPolicyRevision: number;
}

export interface OpenedMcpClient {
  client: Client;
  close(): Promise<void>;
}

/**
 * official MCP client가 실제 HTTP로 접속하는 Work OS app integration fixture다.
 *
 * Better Auth issuer, MCP resource, OAuth redirect URL이 같은 origin을 가리켜야 하므로
 * ephemeral port를 먼저 정하고 관련 환경 변수를 덮어쓴 뒤 app을 만든다. close 때 복원한다.
 * 이 fixture로 만든 actor는 고유 식별자를 쓰고 `cleanupActors`/`close`에서 정리한다.
 */
export class McpIntegrationApp {
  private readonly userIds = new Set<string>();
  private readonly organizationIds = new Set<string>();

  private constructor(
    readonly app: INestApplication,
    readonly database: DatabaseService['db'],
    readonly baseUrl: string,
    private readonly originalEnvironment: ReadonlyMap<
      string,
      string | undefined
    >,
  ) {}

  static async start(): Promise<McpIntegrationApp> {
    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const originalEnvironment = new Map(
      OVERRIDDEN_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      BETTER_AUTH_URL: baseUrl,
      APP_TRUSTED_ORIGINS: baseUrl,
      MCP_RESOURCE_URL: `${baseUrl}/mcp`,
      MCP_ALLOWED_HOSTS: '127.0.0.1,localhost',
      MCP_ALLOWED_ORIGINS: '127.0.0.1,localhost',
      MCP_AGENT_OAUTH_REDIRECT_URL: `${baseUrl}/mcp/agent-delegation/callback`,
    });

    const moduleFixture = await createAppTestingModule().compile();
    const app = moduleFixture.createNestApplication({ bodyParser: false });
    await app.listen(port, '127.0.0.1');
    return new McpIntegrationApp(
      app,
      app.get(DatabaseService).db,
      baseUrl,
      originalEnvironment,
    );
  }

  get resourceUrl(): string {
    return `${this.baseUrl}/mcp`;
  }

  /**
   * 회원가입 → 조직 생성 → 조직/개인 MCP policy → Personal Access Key 발급을 실제 REST로 수행한다.
   */
  async createActor(input: { scopes: readonly McpScope[] }): Promise<McpActor> {
    const id = randomUUID().replaceAll('-', '').slice(0, 16);
    const agent = request
      .agent(this.app.getHttpServer())
      .set('Origin', this.baseUrl);

    const signUp = expectStatus(
      await agent.post('/api/auth/sign-up/email').send({
        email: `mcp-${id}@example.com`,
        name: `MCP Integration ${id}`,
        password: 'StrongPassword123!',
        username: `mcp${id}`,
      }),
      200,
      '회원가입',
    );
    agent.set('Cookie', toCookieHeader(signUp.headers['set-cookie']));
    const userId: string = signUp.body.user.id;
    this.userIds.add(userId);

    const createdOrganization = expectStatus(
      await agent
        .post('/organizations')
        .send({ name: `MCP Integration ${id}`, slug: `mcp-${id}` }),
      201,
      '조직 생성',
    );
    const organizationId: string = createdOrganization.body.organization.id;
    this.organizationIds.add(organizationId);

    const initialAccess = expectStatus(
      await agent.get(`/organizations/${organizationId}/mcp-access`),
      200,
      'MCP access 조회',
    );
    const organizationUpdate = expectStatus(
      await agent
        .patch(
          `/organizations/${organizationId}/mcp-access/organization-policy`,
        )
        .send({
          allowedScopes: input.scopes,
          expectedRevision: initialAccess.body.organizationPolicy.revision,
        }),
      200,
      '조직 MCP policy 변경',
    );
    const userUpdate = expectStatus(
      await agent.patch(`/organizations/${organizationId}/mcp-access/me`).send({
        requestedScopes: input.scopes,
        expectedRevision: organizationUpdate.body.myPolicy.revision,
      }),
      200,
      '개인 MCP policy 변경',
    );

    const keyResponse = expectStatus(
      await agent
        .post('/mcp/access-keys')
        .set('Idempotency-Key', `mcp-${id}`)
        .send({
          name: `mcp-key-${id}`,
          scopes: input.scopes,
          organizationGrant: {
            mode: 'selected',
            organizationIds: [organizationId],
          },
          expiresInDays: 1,
        }),
      201,
      'access key 발급',
    );

    return {
      agent,
      userId,
      organizationId,
      keyId: keyResponse.body.key.id,
      secret: keyResponse.body.secret,
      userPolicyRevision: userUpdate.body.myPolicy.revision,
    };
  }

  /** Work OS MCP에 modern protocol로 접속한 official client를 연다. */
  async connectClient(input: {
    name: string;
    headers?: Record<string, string>;
  }): Promise<OpenedMcpClient> {
    const transport = new StreamableHTTPClientTransport(
      new URL(this.resourceUrl),
      { requestInit: { headers: input.headers } },
    );
    const client = createModernMcpClient(input.name);
    const close = async (): Promise<void> => {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
    };
    try {
      await client.connect(transport);
    } catch (error) {
      await close();
      throw error;
    }
    return { client, close };
  }

  /** delegation start → authorize → consent까지 진행하고 아직 호출하지 않은 callback URL을 돌려준다. */
  async authorizeAgentDelegation(actor: McpActor): Promise<URL> {
    const start = expectStatus(
      await actor.agent
        .post('/mcp/agent-delegation/start')
        .send({ returnTo: '/ai' }),
      201,
      'delegation start',
    );
    const authorizationUrl = new URL(start.body.authorizationUrl);
    const authorization = expectStatus(
      await actor.agent.get(
        authorizationUrl.pathname + authorizationUrl.search,
      ),
      302,
      'OAuth authorize',
    );
    const consentUrl = new URL(
      String(authorization.headers.location),
      this.baseUrl,
    );
    const consent = expectStatus(
      await actor.agent
        .post('/api/auth/oauth2/consent')
        .send({ accept: true, oauth_query: consentUrl.search.slice(1) }),
      200,
      'OAuth consent',
    );
    return new URL(String(consent.body.url), this.baseUrl);
  }

  /** callback까지 호출하고 응답을 그대로 돌려줘 test가 성공과 실패를 모두 검증하게 한다. */
  async completeAgentDelegation(actor: McpActor): Promise<TestResponse> {
    const callbackUrl = await this.authorizeAgentDelegation(actor);
    return actor.agent.get(callbackUrl.pathname + callbackUrl.search);
  }

  /** 이 fixture로 만든 actor의 조직, key, session, account, user를 지운다. */
  async cleanupActors(): Promise<void> {
    const organizationIds = [...this.organizationIds];
    const userIds = [...this.userIds];
    if (organizationIds.length > 0) {
      await this.database
        .delete(organization)
        .where(inArray(organization.id, organizationIds));
    }
    if (userIds.length > 0) {
      await this.database
        .delete(apikey)
        .where(inArray(apikey.referenceId, userIds));
      await this.database
        .delete(session)
        .where(inArray(session.userId, userIds));
      await this.database
        .delete(account)
        .where(inArray(account.userId, userIds));
      await this.database.delete(user).where(inArray(user.id, userIds));
    }
    this.organizationIds.clear();
    this.userIds.clear();
  }

  async close(): Promise<void> {
    await this.cleanupActors();
    await this.app.close();
    for (const [key, value] of this.originalEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

export function createModernMcpClient(name: string): Client {
  return new Client(
    { name, version: '0.0.1' },
    { versionNegotiation: { mode: { pin: WORK_OS_MCP_PROTOCOL_VERSION } } },
  );
}

function expectStatus(
  response: TestResponse,
  status: number,
  operation: string,
): TestResponse {
  if (response.status !== status) {
    throw new Error(
      `${operation} 응답이 ${status}가 아니라 ${response.status}입니다: ${response.text}`,
    );
  }
  return response;
}

function toCookieHeader(value: string | string[] | undefined): string {
  if (!value) throw new Error('회원가입 응답에 session cookie가 없습니다.');
  const values = Array.isArray(value) ? value : [value];
  return values.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (!address || typeof address === 'string') {
    throw new Error('test port를 예약하지 못했습니다.');
  }
  return address.port;
}
