import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import {
  adaptAgentAuth,
  AgentAuth,
  AgentHttpException,
  AgentRuntimeModule,
  createDurableAgentRuntime,
} from '@repo/agent-runtime';

import { AIMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';
import { Client } from '@langchain/langgraph-sdk';
import { MCPAdapter } from '@langchain/mcp-adapters';

const distributionRoot = new URL('../../../dist/', import.meta.url);
const { WorkOsAgentFactory } = await import(
  new URL('agent/application/workos-agent.factory.js', distributionRoot).href
);
const { AgentConfiguration } = await import(
  new URL('agent/config/agent-configuration.js', distributionRoot).href
);
const { DeepAgentBuilder } = await import(
  new URL(
    'agent/infrastructure/deep-agent/deep-agent.builder.js',
    distributionRoot,
  ).href
);
const { DeepAgentWorkOsGraphAdapter } = await import(
  new URL(
    'agent/infrastructure/deep-agent/deep-agent-workos-graph.adapter.js',
    distributionRoot,
  ).href
);
const { McpToolApprovalPolicy } = await import(
  new URL(
    'agent/infrastructure/mcp/langchain/mcp-tool-approval.policy.js',
    distributionRoot,
  ).href
);

const phase = required('AGENT_PROCESS_PHASE');
const databaseUrl = required('AGENT_TEST_DATABASE_URL');
const redisUrl = required('AGENT_TEST_REDIS_URL');
const namespace = required('AGENT_PROCESS_NAMESPACE');
const mcpUrl = required('AGENT_PROCESS_MCP_URL');
const threadId = process.env.AGENT_PROCESS_THREAD_ID;

const models =
  phase === 'interrupt'
    ? {
        root: fakeModel().respondWithTools([
          {
            name: 'task',
            id: 'process-operator-task',
            args: {
              description: 'perform process boundary write',
              subagent_type: 'operator',
            },
          },
        ]),
        researcher: fakeModel().respond(new AIMessage('unused researcher')),
        operator: fakeModel().respondWithTools([
          {
            name: 'wiki_document_update',
            id: 'process-write',
            args: {
              organizationId: 'organization-a',
              documentId: 'document-a',
              title: 'process-approved',
            },
          },
        ]),
      }
    : {
        root: fakeModel().respond(new AIMessage('process root complete')),
        researcher: fakeModel().respond(new AIMessage('unused researcher')),
        operator: fakeModel().respond(
          new AIMessage('process operator complete'),
        ),
      };

const modelProvider = { createModels: () => models };
const authProviderFactory = {
  create: ({ userId }) => ({
    token: async () => `fixture:${userId}`,
  }),
};
const configuration = new AgentConfiguration(
  { mcpToolTimeoutMs: 5_000 },
  { resourceUrl: mcpUrl },
);
// fixture MCP 서버는 HTTP로만 열려 있으므로 테스트 프로세스가 직접 세션을 연다.
const approvalPolicy = new McpToolApprovalPolicy();
const sessions = {
  async open(actor) {
    const adapter = new MCPAdapter({
      prefixToolNameWithServerName: false,
      defaultToolTimeout: configuration.mcp.toolTimeoutMs,
      servers: {
        workos: {
          transport: 'http',
          mode: 'modern',
          url: configuration.mcp.url,
          authProvider: authProviderFactory.create(actor),
        },
      },
    });
    try {
      const tools = await adapter.listTools('workos');
      return {
        tools,
        readOnlyTools: approvalPolicy.readOnlyTools(tools),
        interruptOn: approvalPolicy.interruptOn(tools),
        toolIdentities: new Map(
          tools.map((tool) => [
            tool.name,
            {
              source: 'workos',
              namespace: 'workos',
              originalToolName: tool.name,
            },
          ]),
        ),
        close: () => adapter.close(),
      };
    } catch (error) {
      await adapter.close();
      throw error;
    }
  },
};
const graphs = new DeepAgentWorkOsGraphAdapter(
  modelProvider,
  sessions,
  new DeepAgentBuilder(),
);
const graphFactory = new WorkOsAgentFactory(graphs).createGraphFactory();

const auth = adaptAgentAuth(
  new AgentAuth()
    .authenticate((request) => {
      const identity = request.headers.get('x-test-user');
      if (!identity) {
        throw new AgentHttpException(401, { message: '인증이 필요합니다.' });
      }
      const organizationId =
        request.headers.get('x-test-organization') ?? 'organization-a';
      return {
        identity,
        display_name: identity,
        permissions: [],
        organization_id: organizationId,
      };
    })
    .on('threads', ({ user }) => ({
      owner_user_id: user.identity,
      organization_id: user.organization_id,
    })),
);

const durable = await createDurableAgentRuntime(
  { workos: graphFactory },
  {
    postgresUri: databaseUrl,
    redisUri: redisUrl,
    redisPrefix: `work-os:test:agent-process:${namespace}`,
    runQueueName: `work-os-test-agent-process-${namespace}`,
    runConcurrency: 1,
    runTimeoutMs: 10_000,
    overrides: { auth },
  },
);

const runtimeModule = AgentRuntimeModule.forRoot({
  runtime: {
    deps: durable.deps,
    worker: { maxConcurrency: 1, shutdownGraceMs: 1_000 },
  },
  dispose: () => durable.dispose(),
});
class ProcessAgentModule {}
Module({ imports: [runtimeModule] })(ProcessAgentModule);

const app = await NestFactory.create(ProcessAgentModule, {
  bodyParser: false,
  logger: false,
});
app.enableShutdownHooks();
await app.listen(0, '127.0.0.1');
const address = app.getHttpServer().address();
if (!address || typeof address === 'string') {
  throw new Error('process Agent listener address를 확인할 수 없습니다.');
}
const apiUrl = `http://127.0.0.1:${address.port}`;
const client = new Client({
  apiUrl,
  defaultHeaders: {
    'x-test-user': 'user-a',
    'x-test-organization': 'organization-a',
  },
});

try {
  if (phase === 'interrupt') {
    const thread = await client.threads.create();
    const run = await client.runs.create(thread.thread_id, 'workos', {
      input: {
        messages: [{ role: 'user', content: 'process boundary write' }],
      },
    });
    await waitForRunStatus(client, thread.thread_id, run.run_id, 'interrupted');
    emit({
      phase,
      threadId: thread.thread_id,
      runId: run.run_id,
    });
  } else if (phase === 'resume') {
    if (!threadId) throw new Error('AGENT_PROCESS_THREAD_ID가 필요합니다.');
    const run = await client.runs.create(threadId, 'workos', {
      command: { resume: { decisions: [{ type: 'approve' }] } },
    });
    await waitForRunStatus(client, threadId, run.run_id, 'success');
    const history = await client.threads.getHistory(threadId);
    emit({
      phase,
      threadId,
      runId: run.run_id,
      hasFinalState: JSON.stringify(history).includes('process root complete'),
    });
  } else {
    throw new Error(`지원하지 않는 process phase입니다: ${phase}`);
  }
} finally {
  await app.close();
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경 변수가 필요합니다.`);
  return value;
}

async function waitForRunStatus(client, targetThreadId, runId, expected) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const run = await client.runs.get(targetThreadId, runId);
    if (run.status === expected) return;
    if (['error', 'cancelled', 'timeout'].includes(run.status)) {
      throw new Error(
        `run이 ${run.status} 상태로 종료되었습니다: ${JSON.stringify(run)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`run ${runId} 상태 대기 시간이 초과되었습니다.`);
}

function emit(value) {
  process.stdout.write(`AGENT_PROCESS_RESULT=${JSON.stringify(value)}\n`);
}
