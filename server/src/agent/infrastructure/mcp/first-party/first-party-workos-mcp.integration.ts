import { randomUUID } from 'node:crypto';

import type { AgentConfig } from '@/agent/config/agent-config.type';
import { AgentConfiguration } from '@/agent/config/agent-configuration';
import { FirstPartyWorkOsMcpAdapter } from '@/agent/infrastructure/mcp/first-party/first-party-workos-mcp.adapter';
import { McpToolApprovalPolicy } from '@/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy';
import type { WorkOsToolSession } from '@/agent/infrastructure/mcp/workos-tool-session.provider';
import {
  mutationToolOutputSchema,
  WikiDocumentMutationReceiptSchema,
} from '@/mcp/contracts/agent-mutation-receipt.dto';
import type { McpScope } from '@/mcp/contracts/mcp-scope';
import { McpFirstPartyConnectionService } from '@/mcp/mcp-first-party-connection.service';
import { McpOrganizationMembershipRequiredError } from '@/mcp-access/domain/mcp-access.error';
import { WikiDocumentSchema } from '@/wiki/dto/wiki-document.dto';

import { ToolMessage } from '@langchain/core/messages';
import {
  type McpActor,
  McpIntegrationApp,
} from '@test/support/mcp-integration.fixture';

const WIKI_SCOPES: readonly McpScope[] = ['wiki:read', 'wiki:write'];

describe('built-in Agent 내부 Work OS MCP 연결', () => {
  let target: McpIntegrationApp;
  let adapter: FirstPartyWorkOsMcpAdapter;

  beforeAll(async () => {
    target = await McpIntegrationApp.start();
    adapter = new FirstPartyWorkOsMcpAdapter(
      target.app.get(McpFirstPartyConnectionService, { strict: false }),
      createAgentConfiguration(target.resourceUrl),
      new McpToolApprovalPolicy(),
    );
  });

  afterEach(async () => {
    await target.cleanupActors();
  });

  afterAll(async () => {
    await target.close();
  });

  it('위임 연결 없이 현재 정책 범위의 도구를 노출하고 write 결과를 structured artifact로 돌려준다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const session = await openSession(actor);

    try {
      expect(session.tools.map((tool) => tool.name)).toEqual([
        'wiki_search',
        'wiki_document_get',
        'wiki_document_create',
        'wiki_document_update',
      ]);
      expect(Object.keys(session.interruptOn)).toEqual([
        'wiki_document_create',
        'wiki_document_update',
      ]);
      expect(session.readOnlyTools.map((tool) => tool.name)).toEqual([
        'wiki_search',
        'wiki_document_get',
      ]);

      const message = await invokeTool(session, 'wiki_document_create', {
        organizationId: actor.organizationId,
        title: '내부 연결 문서',
        contentMarkdown: '# built-in agent',
      });
      expect(message.status).not.toBe('error');
      const structured = findStructuredContent(message);
      const output = mutationToolOutputSchema(
        WikiDocumentSchema,
        WikiDocumentMutationReceiptSchema,
      ).parse(structured);
      const document = output.result;
      expect(output.mutation).toMatchObject({
        source: 'workos',
        kind: 'wiki_document',
        operation: 'created',
        organizationId: actor.organizationId,
        resourceId: document.id,
      });

      const authoritative = await actor.agent.get(
        `/organizations/${actor.organizationId}/wiki/documents/${document.id}`,
      );
      expect(authoritative.status).toBe(200);
      expect(authoritative.body).toMatchObject({ title: '내부 연결 문서' });
    } finally {
      await session.close();
    }
  });

  it('세션을 연 뒤 개인 정책을 축소하면 다음 write 호출을 호출 시점에 거부한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const session = await openSession(actor);

    try {
      const shrink = await actor.agent
        .patch(`/organizations/${actor.organizationId}/mcp-access/me`)
        .send({
          requestedScopes: ['wiki:read'],
          expectedRevision: actor.userPolicyRevision,
        });
      expect(shrink.status).toBe(200);

      const denied = await invokeTool(session, 'wiki_document_create', {
        organizationId: actor.organizationId,
        title: '거부되어야 하는 문서',
      });
      expect(denied.status).toBe('error');
    } finally {
      await session.close();
    }

    const reopened = await openSession(actor);
    try {
      expect(reopened.tools.map((tool) => tool.name)).toEqual([
        'wiki_search',
        'wiki_document_get',
      ]);
    } finally {
      await reopened.close();
    }
  });

  it('도구 인수에 다른 조직을 넣으면 활성 조직 밖이므로 거부한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const other = await target.addOrganization(actor, { scopes: WIKI_SCOPES });
    const session = await openSession(actor);

    try {
      const denied = await invokeTool(session, 'wiki_document_create', {
        organizationId: other.organizationId,
        title: '다른 조직 문서',
      });
      expect(denied.status).toBe('error');
    } finally {
      await session.close();
    }
  });

  it('조직 멤버가 아닌 사용자는 세션을 열 수 없다', async () => {
    const owner = await target.createActor({ scopes: WIKI_SCOPES });
    const outsider = await target.createActor({ scopes: WIKI_SCOPES });

    await expect(
      adapter.open({
        userId: outsider.userId,
        organizationId: owner.organizationId,
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(McpOrganizationMembershipRequiredError);
  });

  function openSession(actor: McpActor): Promise<WorkOsToolSession> {
    return adapter.open({
      userId: actor.userId,
      organizationId: actor.organizationId,
      permissions: [],
    });
  }
});

function createAgentConfiguration(resourceUrl: string): AgentConfiguration {
  const config = {
    databaseUrl: 'postgresql://localhost/agent-test',
    redisUrl: 'redis://localhost:6379',
    redisPrefix: 'agent-test',
    model: {
      name: 'test:model',
      baseUrl: 'http://127.0.0.1:11434',
      apiKey: 'fixture-key',
    },
    mcpToolTimeoutMs: 10_000,
    runQueueName: 'agent-test-runs',
    runConcurrency: 1,
    runTimeoutMs: 60_000,
    shutdownGraceMs: 1_000,
    migrateOnStartup: false,
    replayStreamTtlSeconds: 60,
    replayClosedTtlSeconds: 60,
    replayStreamMaxLength: 100,
    replaySubscriberBufferFrames: 16,
  } satisfies AgentConfig;
  return new AgentConfiguration(config, { resourceUrl });
}

async function invokeTool(
  session: WorkOsToolSession,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolMessage> {
  const tool = session.tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`${name} 도구가 세션에 없습니다.`);

  const result: unknown = await tool.invoke({
    type: 'tool_call',
    id: randomUUID(),
    name,
    args,
  });
  if (!ToolMessage.isInstance(result)) {
    throw new Error('tool_call 호출 결과가 ToolMessage가 아닙니다.');
  }
  return result;
}

function findStructuredContent(message: ToolMessage): unknown {
  const artifacts: unknown = message.artifact;
  if (!Array.isArray(artifacts)) return undefined;
  for (const artifact of artifacts) {
    if (
      typeof artifact === 'object' &&
      artifact !== null &&
      'type' in artifact &&
      artifact.type === 'mcp_structured_content' &&
      'data' in artifact
    ) {
      return artifact.data;
    }
  }
  return undefined;
}
