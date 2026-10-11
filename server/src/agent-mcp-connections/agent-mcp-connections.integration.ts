import { agentMcpConnection } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.schema';
import { agentMcpConnectionTool } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection-tool.schema';
import { agentMcpCredential } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-credential.schema';
import type { McpScope } from '@/mcp/contracts/mcp-scope';

import {
  type StartedTeamspaceMcpFixture,
  startTeamspaceMcpFixture,
} from '@test/agent/fixtures/teamspace-mcp.fixture';
import {
  type LoopbackTlsCertificate,
  trustLoopbackTlsCertificate,
} from '@test/support/loopback-tls';
import {
  type McpActor,
  McpIntegrationApp,
} from '@test/support/mcp-integration.fixture';
import { eq } from 'drizzle-orm';

const SCOPES: readonly McpScope[] = ['wiki:read'];

describe('external MCP 연결 product 통합', () => {
  let tls: LoopbackTlsCertificate;
  let fixture: StartedTeamspaceMcpFixture;

  beforeAll(async () => {
    tls = await trustLoopbackTlsCertificate();
    fixture = await startTeamspaceMcpFixture({ tls });
  });

  afterAll(async () => {
    await fixture.close();
    tls.restoreTrust();
  });

  describe('private network 접근을 허용한 개발 환경', () => {
    let target: McpIntegrationApp;

    beforeAll(async () => {
      target = await McpIntegrationApp.start({
        environment: { AGENT_EXTERNAL_MCP_ALLOW_PRIVATE_NETWORKS: 'true' },
      });
    });

    afterEach(async () => {
      await target.cleanupActors();
    });

    afterAll(async () => {
      await target.close();
    });

    it('bearer 연결은 원격 discovery 뒤 확정되고 token은 응답과 저장 row에 평문으로 남지 않는다', async () => {
      const actor = await target.createActor({ scopes: SCOPES });
      const token = `fixture:${actor.userId}`;

      const created = await createConnection(actor, token);

      expect(created.status).toBe(201);
      const connectionId: string = created.body.id;
      const list = await actor.agent.get('/agent/mcp-connections').expect(200);
      const detail = await actor.agent
        .get(`/agent/mcp-connections/${connectionId}`)
        .expect(200);
      const tools = await actor.agent
        .get(`/agent/mcp-connections/${connectionId}/tools`)
        .expect(200);
      expect(JSON.stringify(tools.body)).toContain('fixture_read');

      const stored = JSON.stringify([
        await target.database
          .select()
          .from(agentMcpConnection)
          .where(eq(agentMcpConnection.id, connectionId)),
        await target.database
          .select()
          .from(agentMcpCredential)
          .where(eq(agentMcpCredential.connectionId, connectionId)),
      ]);
      for (const exposed of [created.body, list.body, detail.body, stored]) {
        expect(JSON.stringify(exposed)).not.toContain(token);
      }
    });

    it('preflight가 실패하면 pending 연결과 credential을 남기지 않는다', async () => {
      const actor = await target.createActor({ scopes: SCOPES });

      const rejected = await createConnection(actor, 'not-a-fixture-token');

      expect(rejected.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(rejected.body)).not.toContain(
        'not-a-fixture-token',
      );
      await expect(ownedConnectionIds(actor)).resolves.toEqual([]);
    });

    it('다른 user와 같은 user의 다른 조직은 연결을 조회·변경·삭제하지 못한다', async () => {
      const owner = await target.createActor({ scopes: SCOPES });
      const created = await createConnection(owner, `fixture:${owner.userId}`);
      expect(created.status).toBe(201);
      const path = `/agent/mcp-connections/${created.body.id}`;
      const expectedRevision: number = created.body.revision;
      const stranger = await target.createActor({ scopes: SCOPES });

      for (const response of [
        await stranger.agent.get(path),
        await stranger.agent
          .patch(path)
          .send({ displayName: '탈취', expectedRevision }),
        await stranger.agent.delete(path).query({ expectedRevision }),
      ]) {
        expect(response.status).toBe(404);
      }

      await target.addOrganization(owner, { scopes: SCOPES });
      expect((await owner.agent.get(path)).status).toBe(404);
      await owner.agent
        .put('/organizations/active')
        .send({ organizationId: owner.organizationId })
        .expect(200);
      expect((await owner.agent.get(path)).status).toBe(200);
    });

    it('연결 삭제는 credential과 tool row를 함께 지운다', async () => {
      const actor = await target.createActor({ scopes: SCOPES });
      const created = await createConnection(actor, `fixture:${actor.userId}`);
      expect(created.status).toBe(201);
      const connectionId: string = created.body.id;

      await actor.agent
        .delete(`/agent/mcp-connections/${connectionId}`)
        .query({ expectedRevision: created.body.revision })
        .expect(204);

      await expect(ownedConnectionIds(actor)).resolves.toEqual([]);
      await expect(
        target.database
          .select({ connectionId: agentMcpCredential.connectionId })
          .from(agentMcpCredential)
          .where(eq(agentMcpCredential.connectionId, connectionId)),
      ).resolves.toEqual([]);
      await expect(
        target.database
          .select({ id: agentMcpConnectionTool.id })
          .from(agentMcpConnectionTool)
          .where(eq(agentMcpConnectionTool.connectionId, connectionId)),
      ).resolves.toEqual([]);
    });

    function ownedConnectionIds(actor: McpActor) {
      return target.database
        .select({ id: agentMcpConnection.id })
        .from(agentMcpConnection)
        .where(eq(agentMcpConnection.ownerUserId, actor.userId))
        .then((rows) => rows.map((row) => row.id));
    }
  });

  describe('private network 접근을 허용하지 않는 기본 환경', () => {
    let target: McpIntegrationApp;

    beforeAll(async () => {
      target = await McpIntegrationApp.start({
        environment: { AGENT_EXTERNAL_MCP_ALLOW_PRIVATE_NETWORKS: 'false' },
      });
    });

    afterAll(async () => {
      await target.close();
    });

    it('loopback endpoint는 원격 요청 전에 거부하고 연결을 남기지 않는다', async () => {
      const actor = await target.createActor({ scopes: SCOPES });
      const requestsBefore = fixture.state.actors.length;

      const rejected = await createConnection(actor, `fixture:${actor.userId}`);

      expect(rejected.status).toBeGreaterThanOrEqual(400);
      expect(fixture.state.actors).toHaveLength(requestsBefore);
      await expect(
        target.database
          .select({ id: agentMcpConnection.id })
          .from(agentMcpConnection)
          .where(eq(agentMcpConnection.ownerUserId, actor.userId)),
      ).resolves.toEqual([]);
    });
  });

  function createConnection(actor: McpActor, bearerToken: string) {
    return actor.agent.post('/agent/mcp-connections').send({
      displayName: 'Loopback fixture MCP',
      endpoint: fixture.url,
      authKind: 'bearer',
      bearerToken,
    });
  }
});
