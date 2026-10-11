import type { AddressInfo } from 'node:net';

import { type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import {
  adaptAgentAuth,
  AgentAuth,
  AgentHttpException,
  AgentRuntimeModule,
  createInMemoryAgentRuntimeDeps,
  type TelemetrySink,
} from '@repo/agent-runtime';
import type { McpCredentialProvider } from '@/agent/infrastructure/mcp/mcp-credential.provider';
import {
  AgentModelProvider,
  type AgentModels,
} from '@/agent/infrastructure/model/agent-model.provider';
import { waitForCondition } from '@/testing/wait-for-condition';

import { AIMessage } from '@langchain/core/messages';
import { type FakeBuiltModel, fakeModel } from '@langchain/core/testing';
import { Client } from '@langchain/langgraph-sdk';
import { createTestTeamspaceAgentGraphFactory } from '@test/agent/support/teamspace-agent-test-graph';

export const testAgentCredentials: McpCredentialProvider = {
  getCredential: ({ userId }) => ({ token: async () => `fixture:${userId}` }),
};

export function createFixtureAgentAuth(
  validateActor?: (identity: string, organizationId: string) => void,
) {
  return adaptAgentAuth(
    new AgentAuth()
      .authenticate((request) => {
        const identity = request.headers.get('x-test-user');
        if (!identity) {
          throw new AgentHttpException(401, { message: '인증이 필요합니다.' });
        }
        const organizationId =
          request.headers.get('x-test-organization') ?? 'organization-a';
        validateActor?.(identity, organizationId);
        return {
          identity,
          display_name: identity,
          permissions: [],
          organization_id: organizationId,
        };
      })
      .on('threads', ({ user }) => ({
        owner_user_id: user.identity,
        organization_id: requireFixtureOrganizationId(user),
      }))
      .on('store', ({ user, value }) => {
        value.namespace = [
          fixtureTenantNamespace(
            user.identity,
            requireFixtureOrganizationId(user),
          ),
          ...(value.namespace ?? []).slice(1),
        ];
      }),
  );
}

export const testAgentAuth = createFixtureAgentAuth();

export class FixtureModelProvider extends AgentModelProvider {
  constructor(private readonly models: AgentModels) {
    super();
  }

  createModels(): AgentModels {
    return this.models;
  }
}

export interface StartedAgentApp {
  app: INestApplication;
  apiUrl: string;
  client(userId: string, organizationId?: string): Client;
  close(): Promise<void>;
}

export async function startAgentApp(input: {
  mcpUrl: string;
  modelProvider: AgentModelProvider;
  credentialProvider?: McpCredentialProvider;
  auth?: typeof testAgentAuth;
  telemetry?: TelemetrySink;
}): Promise<StartedAgentApp> {
  const graph = createTestTeamspaceAgentGraphFactory({
    modelProvider: input.modelProvider,
    credentialProvider: input.credentialProvider ?? testAgentCredentials,
    mcpUrl: input.mcpUrl,
    mcpToolTimeoutMs: 5_000,
  });
  const deps = createInMemoryAgentRuntimeDeps(
    { workos: graph },
    {
      auth: input.auth ?? testAgentAuth,
      ...(input.telemetry ? { telemetry: input.telemetry } : {}),
    },
  );

  @Module({
    imports: [AgentRuntimeModule.forRoot({ runtime: { deps } })],
  })
  class TeamspaceAgentTestModule {}

  const app = await NestFactory.create(TeamspaceAgentTestModule, {
    bodyParser: false,
    logger: false,
  });
  app.enableShutdownHooks();
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as AddressInfo;
  const apiUrl = `http://127.0.0.1:${address.port}`;

  return {
    app,
    apiUrl,
    client: (userId, organizationId = 'organization-a') =>
      new Client({
        apiUrl,
        defaultHeaders: {
          'x-test-user': userId,
          'x-test-organization': organizationId,
        },
      }),
    close: () => app.close(),
  };
}

function requireFixtureOrganizationId(user: {
  organization_id?: unknown;
}): string {
  const organizationId = user.organization_id;
  if (typeof organizationId !== 'string' || organizationId.length === 0) {
    throw new AgentHttpException(403, {
      message: '테스트 Agent 조직 context가 필요합니다.',
    });
  }
  return organizationId;
}

function fixtureTenantNamespace(
  identity: string,
  organizationId: string,
): string {
  return encodeURIComponent(`${organizationId}:${identity}`)
    .replace(/\./g, '%2E')
    .replace(/\*/g, '%2A');
}

export function unusedModel(): FakeBuiltModel {
  return fakeModel().respond(new AIMessage('unused'));
}

export { waitForCondition };

export async function waitForRunStatus(
  client: Client,
  threadId: string,
  runId: string,
  expected: string,
  timeoutMs = 8_000,
): Promise<void> {
  await waitForCondition(
    async () => {
      const run = await client.runs.get(threadId, runId);
      if (run.status === expected) return true;
      if (['error', 'cancelled', 'timeout'].includes(run.status)) {
        throw new Error(
          `run이 ${run.status} 상태로 종료되었습니다: ${JSON.stringify(run)}`,
        );
      }
      return false;
    },
    `run ${runId} 상태 대기 시간이 초과되었습니다.`,
    { timeoutMs },
  );
}
