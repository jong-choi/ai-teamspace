import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  account,
  apikey,
  organization,
  session,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import type { AllConfigType } from '@/config/config.type';
import { DatabaseService } from '@/database/database.service';
import { WORK_OS_MCP_PROTOCOL_VERSION } from '@/mcp/contracts/mcp-protocol';
import type { McpScope } from '@/mcp/contracts/mcp-scope';
import { OrganizationMemberListSchema } from '@/organizations/dto/organization-member-list.dto';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';

import {
  type AuthProvider,
  Client,
  type FetchLike,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createAppTestingModule } from '@test/support/app-testing-module';
import { inArray } from 'drizzle-orm';
import request, { type Response as TestResponse } from 'supertest';

type TestAgent = ReturnType<typeof request.agent>;

export interface McpActor {
  agent: TestAgent;
  userId: string;
  organizationId: string;
  keyId: string;
  secret: string;
  sessionCookie: string;
  userPolicyRevision: number;
}

export interface McpMember {
  agent: TestAgent;
  userId: string;
  username: string;
  organizationId: string;
  memberId: string;
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

  /** `environment`는 이 app에만 필요한 환경 변수 override이며 close 때 함께 복원한다. */
  static async start(
    options: {
      environment?: Record<string, string>;
      logger?: NestApplicationOptions['logger'];
    } = {},
  ): Promise<McpIntegrationApp> {
    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const overrides: Record<string, string> = {
      BETTER_AUTH_URL: baseUrl,
      APP_TRUSTED_ORIGINS: baseUrl,
      MCP_RESOURCE_URL: `${baseUrl}/mcp`,
      MCP_ALLOWED_HOSTS: '127.0.0.1,localhost',
      MCP_ALLOWED_ORIGINS: '127.0.0.1,localhost',
      MCP_AGENT_OAUTH_REDIRECT_URL: `${baseUrl}/mcp/agent-delegation/callback`,
      ...options.environment,
    };
    const originalEnvironment = new Map(
      Object.keys(overrides).map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, overrides);

    const moduleFixture = await createAppTestingModule().compile();
    const app = moduleFixture.createNestApplication({
      bodyParser: false,
      ...(options.logger === undefined ? {} : { logger: options.logger }),
    });
    if (options.logger !== undefined) app.useLogger(options.logger);
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

  /** app이 실제로 검증해 사용하는 MCP 설정이다. */
  get mcpConfig(): AllConfigType['mcp'] {
    return this.app
      .get(ConfigService<AllConfigType>)
      .getOrThrow('mcp', { infer: true });
  }

  /**
   * 회원가입 → 조직 생성 → 조직/개인 MCP policy → Personal Access Key 발급을 실제 REST로 수행한다.
   */
  async createActor(input: { scopes: readonly McpScope[] }): Promise<McpActor> {
    const { agent, userId, sessionCookie } = await this.signUp();
    const { organizationId, userPolicyRevision } = await this.addOrganization(
      { agent },
      { scopes: input.scopes },
    );

    const id = uniqueId();
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
      sessionCookie,
      userPolicyRevision,
    };
  }

  /** 새 조직을 만들어 활성 조직으로 두고 조직과 개인 MCP policy를 `scopes`로 맞춘다. */
  async addOrganization(
    actor: Pick<McpActor, 'agent'>,
    input: { scopes: readonly McpScope[] },
  ): Promise<{ organizationId: string; userPolicyRevision: number }> {
    const id = uniqueId();
    const created = expectStatus(
      await actor.agent
        .post('/organizations')
        .send({ name: `MCP Integration ${id}`, slug: `mcp-${id}` }),
      201,
      '조직 생성',
    );
    const organizationId: string = created.body.organization.id;
    this.organizationIds.add(organizationId);

    const access = expectStatus(
      await actor.agent.get(`/organizations/${organizationId}/mcp-access`),
      200,
      'MCP access 조회',
    );
    expectStatus(
      await actor.agent
        .patch(
          `/organizations/${organizationId}/mcp-access/organization-policy`,
        )
        .send({
          allowedScopes: input.scopes,
          expectedRevision: access.body.organizationPolicy.revision,
        }),
      200,
      '조직 MCP policy 변경',
    );
    const userPolicyRevision = await this.requestUserScopes(
      actor.agent,
      organizationId,
      input.scopes,
    );
    return { organizationId, userPolicyRevision };
  }

  /** owner 조직에 새 user를 member로 초대·수락시키고 활성 조직과 개인 MCP policy를 맞춘다. */
  async addMember(
    owner: McpActor,
    input: { scopes: readonly McpScope[] },
  ): Promise<McpMember> {
    const member = await this.inviteMember(owner, await this.signUp());
    await this.requestUserScopes(
      member.agent,
      owner.organizationId,
      input.scopes,
    );
    return member;
  }

  /** 기존 user를 owner 조직에 초대·수락시키고 활성 조직으로 둔다. 개인 MCP policy는 바꾸지 않는다. */
  async inviteMember(
    owner: McpActor,
    invitee: Pick<McpMember, 'agent' | 'userId' | 'username'>,
  ): Promise<McpMember> {
    const invitation = expectStatus(
      await owner.agent
        .post(`/organizations/${owner.organizationId}/invitations`)
        .send({ recipientUsername: invitee.username, role: 'member' }),
      201,
      '조직 초대',
    );
    expectStatus(
      await invitee.agent.post(`/invitations/${invitation.body.id}/accept`),
      200,
      '초대 수락',
    );
    expectStatus(
      await invitee.agent
        .put('/organizations/active')
        .send({ organizationId: owner.organizationId }),
      200,
      '활성 조직 변경',
    );

    const members = expectStatus(
      await owner.agent.get(`/organizations/${owner.organizationId}/members`),
      200,
      '조직 member 조회',
    );
    const member = OrganizationMemberListSchema.parse(members.body).items.find(
      (item) => item.userId === invitee.userId,
    );
    if (!member) throw new Error('초대를 수락한 member를 찾지 못했습니다.');

    return {
      agent: invitee.agent,
      userId: invitee.userId,
      username: invitee.username,
      organizationId: owner.organizationId,
      memberId: member.id,
    };
  }

  /** Work OS MCP에 modern protocol로 접속한 official client를 연다. */
  async connectClient(input: {
    name: string;
    headers?: Record<string, string>;
    authProvider?: AuthProvider;
    fetch?: FetchLike;
  }): Promise<OpenedMcpClient> {
    const transport = new StreamableHTTPClientTransport(
      new URL(this.resourceUrl),
      {
        requestInit: { headers: input.headers },
        authProvider: input.authProvider,
        fetch: input.fetch,
      },
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
  async authorizeAgentDelegation(actor: Pick<McpActor, 'agent'>): Promise<URL> {
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
  async completeAgentDelegation(
    actor: Pick<McpActor, 'agent'>,
  ): Promise<TestResponse> {
    const callbackUrl = await this.authorizeAgentDelegation(actor);
    return actor.agent.get(callbackUrl.pathname + callbackUrl.search);
  }

  private async signUp(): Promise<{
    agent: TestAgent;
    userId: string;
    username: string;
    sessionCookie: string;
  }> {
    const id = uniqueId();
    const username = `mcp${id}`;
    const agent = request
      .agent(this.app.getHttpServer())
      .set('Origin', this.baseUrl);
    const signUp = expectStatus(
      await agent.post('/api/auth/sign-up/email').send({
        email: `mcp-${id}@example.com`,
        name: `MCP Integration ${id}`,
        password: 'StrongPassword123!',
        username,
      }),
      200,
      '회원가입',
    );
    const sessionCookie = toCookieHeader(signUp.headers['set-cookie']);
    agent.set('Cookie', sessionCookie);
    const userId: string = signUp.body.user.id;
    this.userIds.add(userId);
    return { agent, userId, username, sessionCookie };
  }

  /** 개인 MCP policy의 요청 scope를 바꾸고 새 revision을 돌려준다. */
  private async requestUserScopes(
    agent: TestAgent,
    organizationId: string,
    scopes: readonly McpScope[],
  ): Promise<number> {
    const access = expectStatus(
      await agent.get(`/organizations/${organizationId}/mcp-access`),
      200,
      'MCP access 조회',
    );
    const updated = expectStatus(
      await agent.patch(`/organizations/${organizationId}/mcp-access/me`).send({
        requestedScopes: scopes,
        expectedRevision: access.body.myPolicy.revision,
      }),
      200,
      '개인 MCP policy 변경',
    );
    return updated.body.myPolicy.revision;
  }

  /** 이 fixture로 만든 actor의 조직, key, session, account, user를 지운다. */
  async cleanupActors(): Promise<void> {
    const organizationIds = [...this.organizationIds];
    const userIds = [...this.userIds];
    if (organizationIds.length > 0) {
      // project는 조직 FK 없이 생성자를 restrict로 참조하므로 user보다 먼저 test 조직의 project를 지운다.
      await this.database
        .delete(project)
        .where(inArray(project.organizationId, organizationIds));
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
    try {
      await this.cleanupActors();
    } finally {
      await this.app.close();
      for (const [key, value] of this.originalEnvironment) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
}

/**
 * official client 없이 raw HTTP로 보낼 modern protocol JSON-RPC 요청이다.
 * 2026-07-28 revision은 요청마다 `Mcp-Method` header와 `_meta` envelope를 요구한다.
 */
export function modernMcpRequest(
  method: string,
  meta: Record<string, unknown> = {},
): { headers: Record<string, string>; body: string } {
  return {
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': WORK_OS_MCP_PROTOCOL_VERSION,
      'Mcp-Method': method,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion':
            WORK_OS_MCP_PROTOCOL_VERSION,
          'io.modelcontextprotocol/clientCapabilities': {},
          ...meta,
        },
      },
    }),
  };
}

export function createModernMcpClient(name: string): Client {
  return new Client(
    { name, version: '0.0.1' },
    { versionNegotiation: { mode: { pin: WORK_OS_MCP_PROTOCOL_VERSION } } },
  );
}

function uniqueId(): string {
  return randomUUID().replaceAll('-', '').slice(0, 16);
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
