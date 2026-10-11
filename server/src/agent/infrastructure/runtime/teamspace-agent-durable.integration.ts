import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import {
  AgentRuntimeModule,
  createDurableAgentRuntime,
} from '@repo/agent-runtime';
import {
  AgentModelProvider,
  type AgentModels,
} from '@/agent/infrastructure/model/agent-model.provider';

import { jest } from '@jest/globals';
import { AIMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';
import { Client } from '@langchain/langgraph-sdk';
import { startTeamspaceMcpFixture } from '@test/agent/fixtures/teamspace-mcp.fixture';
import {
  FixtureModelProvider as IntegrationModelProvider,
  testAgentAuth,
  testAgentCredentials,
  unusedModel,
  waitForCondition,
  waitForRunStatus,
} from '@test/agent/support/teamspace-agent.e2e-support';
import { createTestTeamspaceAgentGraphFactory } from '@test/agent/support/teamspace-agent-test-graph';
import { deleteRedisTestKeys } from '@test/support/redis-test-keys';

jest.setTimeout(30_000);

const databaseUrl = process.env['DATABASE_URL'];
const redisUrl = process.env['AGENT_TEST_REDIS_URL'];
const integrationDescribe = databaseUrl && redisUrl ? describe : describe.skip;
const REDIS_PREFIX_ROOT = 'work-os:test:agent03';
const RUN_QUEUE_ROOT = 'work-os-test-agent03';

interface StartedDurableApp {
  app: INestApplication;
  apiUrl: string;
  client(userId?: string): Client;
  close(): Promise<void>;
}

async function startDurableApp(input: {
  mcpUrl: string;
  modelProvider: AgentModelProvider;
  namespace: string;
}): Promise<StartedDurableApp> {
  if (!databaseUrl || !redisUrl)
    throw new Error('Agent integration infra가 없습니다.');
  const graph = createTestTeamspaceAgentGraphFactory({
    modelProvider: input.modelProvider,
    credentialProvider: testAgentCredentials,
    mcpUrl: input.mcpUrl,
    mcpToolTimeoutMs: 2_000,
  });
  const durable = await createDurableAgentRuntime(
    { workos: graph },
    {
      postgresUri: databaseUrl,
      redisUri: redisUrl,
      redisPrefix: `${REDIS_PREFIX_ROOT}:${input.namespace}`,
      runQueueName: `${RUN_QUEUE_ROOT}-${input.namespace}`,
      runConcurrency: 1,
      runTimeoutMs: 10_000,
      overrides: { auth: testAgentAuth },
    },
  );

  const runtimeModule = AgentRuntimeModule.forRoot({
    runtime: {
      deps: durable.deps,
      worker: { maxConcurrency: 1, shutdownGraceMs: 1_000 },
    },
    dispose: () => durable.dispose(),
  });

  @Module({ imports: [runtimeModule] })
  class DurableTeamspaceAgentModule {}

  const app = await NestFactory.create(DurableTeamspaceAgentModule, {
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
    client: (userId = 'user-a') =>
      new Client({
        apiUrl,
        defaultHeaders: { 'x-test-user': userId },
      }),
    close: () => app.close(),
  };
}

function initialHitlModels(): AgentModels {
  return {
    root: fakeModel().respondWithTools([
      {
        name: 'task',
        id: 'restart-operator-task',
        args: {
          description: 'perform durable write',
          subagent_type: 'operator',
        },
      },
    ]),
    researcher: unusedModel(),
    operator: fakeModel().respondWithTools([
      {
        name: 'fixture_write',
        id: 'restart-write-action',
        args: { value: 'restart-approved' },
      },
    ]),
  };
}

integrationDescribe('AI Teamspace DeepAgent durable runtime', () => {
  afterAll(async () => {
    if (!redisUrl) return;
    await deleteRedisTestKeys(redisUrl, [
      `${REDIS_PREFIX_ROOT}:*`,
      `bull:${RUN_QUEUE_ROOT}-*`,
    ]);
  });

  test('DeepAgent checkpoint가 restart 뒤 유지되고 state/history 조회는 MCP outage와 독립적이다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const namespace = `${randomUUID()}`;
    const first = await startDurableApp({
      mcpUrl: fixture.url,
      namespace,
      modelProvider: new IntegrationModelProvider({
        root: fakeModel()
          .respondWithTools([
            {
              name: 'fixture_read',
              id: 'durable-read',
              args: { query: 'persist-me' },
            },
          ])
          .respond(new AIMessage('durable deepagent complete')),
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
    });

    const client = first.client();
    const thread = await client.threads.create();
    const output = await client.runs.wait(thread.thread_id, 'workos', {
      input: { messages: [{ role: 'user', content: 'persist fixture read' }] },
    });
    expect(JSON.stringify(output)).toContain('durable deepagent complete');
    expect(fixture.state.reads).toContainEqual({
      actor: 'user-a',
      query: 'persist-me',
    });

    await first.close();
    await fixture.close();

    const restarted = await startDurableApp({
      mcpUrl: fixture.url,
      namespace,
      modelProvider: new IntegrationModelProvider({
        root: unusedModel(),
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
    });
    try {
      const restartedClient = restarted.client();
      const state = await restartedClient.threads.getState(thread.thread_id);
      const history = await restartedClient.threads.getHistory(
        thread.thread_id,
      );
      const persisted = JSON.stringify({ state, history });
      expect(persisted).toContain('durable deepagent complete');
      expect(persisted).not.toContain('fixture:user-a');
    } finally {
      await restarted.close();
    }
  });

  test('다른 durable instance의 cancel이 DeepAgent MCP request AbortSignal까지 전달된다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const namespace = `multi-cancel-${randomUUID()}`;
    const sharedProvider = new IntegrationModelProvider({
      root: fakeModel().respondWithTools([
        {
          name: 'fixture_wait',
          id: 'multi-cancel-wait',
          args: { milliseconds: 5_000 },
        },
      ]),
      researcher: unusedModel(),
      operator: unusedModel(),
    });
    const [instanceA, instanceB] = await Promise.all([
      startDurableApp({
        mcpUrl: fixture.url,
        namespace,
        modelProvider: sharedProvider,
      }),
      startDurableApp({
        mcpUrl: fixture.url,
        namespace,
        modelProvider: sharedProvider,
      }),
    ]);

    try {
      const clientA = instanceA.client();
      const clientB = instanceB.client();
      const thread = await clientA.threads.create();
      const run = await clientA.runs.create(thread.thread_id, 'workos', {
        input: {
          messages: [{ role: 'user', content: 'cancel cross instance' }],
        },
      });
      await waitForRunStatus(clientA, thread.thread_id, run.run_id, 'running');
      await waitForCondition(
        () => fixture.state.waits.length === 1,
        'MCP wait tool이 시작되지 않았습니다.',
      );

      await clientB.runs.cancel(thread.thread_id, run.run_id, true);
      await waitForRunStatus(
        clientB,
        thread.thread_id,
        run.run_id,
        'cancelled',
      );
      await waitForCondition(
        () => fixture.state.waits.some((entry) => entry.cancelled),
        'cross-instance cancel이 MCP AbortSignal까지 전달되지 않았습니다.',
      );
      expect(fixture.state.waits).toEqual([
        { actor: 'user-a', cancelled: true },
      ]);
    } finally {
      await Promise.allSettled([instanceA.close(), instanceB.close()]);
      await fixture.close();
    }
  });

  test('DeepAgent resumable stream을 다른 durable instance가 Last-Event-ID 이후부터 replay한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const namespace = `multi-replay-${randomUUID()}`;
    const sharedProvider = new IntegrationModelProvider({
      root: fakeModel()
        .respondWithTools([
          {
            name: 'fixture_wait',
            id: 'multi-replay-wait',
            args: { milliseconds: 400 },
          },
        ])
        .respond(new AIMessage('deep replay complete')),
      researcher: unusedModel(),
      operator: unusedModel(),
    });
    const [instanceA, instanceB] = await Promise.all([
      startDurableApp({
        mcpUrl: fixture.url,
        namespace,
        modelProvider: sharedProvider,
      }),
      startDurableApp({
        mcpUrl: fixture.url,
        namespace,
        modelProvider: sharedProvider,
      }),
    ]);

    try {
      const clientA = instanceA.client();
      const clientB = instanceB.client();
      const thread = await clientA.threads.create();
      const run = await clientA.runs.create(thread.thread_id, 'workos', {
        input: { messages: [{ role: 'user', content: 'deep replay' }] },
        streamMode: 'values',
        streamResumable: true,
      });

      let lastEventId: string | undefined;
      for await (const chunk of clientA.runs.joinStream(
        thread.thread_id,
        run.run_id,
        { streamMode: 'values' },
      )) {
        if (chunk.id) {
          lastEventId = chunk.id;
          break;
        }
      }
      expect(lastEventId).toBeDefined();

      const replayed: string[] = [];
      for await (const chunk of clientB.runs.joinStream(
        thread.thread_id,
        run.run_id,
        { lastEventId, streamMode: 'values' },
      )) {
        replayed.push(JSON.stringify(chunk));
      }
      expect(replayed.join('\n')).toContain('deep replay complete');
      expect(fixture.state.waits).toHaveLength(1);
    } finally {
      await Promise.allSettled([instanceA.close(), instanceB.close()]);
      await fixture.close();
    }
  });

  test('두 durable instance가 동시에 살아 있을 때 다른 instance에서 HITL resume해도 write를 한 번만 실행한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const namespace = `multi-hitl-${randomUUID()}`;
    const sharedProvider = new IntegrationModelProvider({
      root: fakeModel()
        .respondWithTools([
          {
            name: 'task',
            id: 'multi-operator-task',
            args: {
              description: 'perform multi write',
              subagent_type: 'operator',
            },
          },
        ])
        .respond(new AIMessage('multi root complete')),
      researcher: unusedModel(),
      operator: fakeModel()
        .respondWithTools([
          {
            name: 'fixture_write',
            id: 'multi-write-action',
            args: { value: 'multi-approved' },
          },
        ])
        .respond(new AIMessage('multi operator complete')),
    });
    const instanceA = await startDurableApp({
      mcpUrl: fixture.url,
      namespace,
      modelProvider: sharedProvider,
    });

    try {
      const clientA = instanceA.client();
      const thread = await clientA.threads.create();
      const interrupted = await clientA.runs.create(
        thread.thread_id,
        'workos',
        {
          input: {
            messages: [{ role: 'user', content: 'multi instance write' }],
          },
        },
      );
      await waitForRunStatus(
        clientA,
        thread.thread_id,
        interrupted.run_id,
        'interrupted',
      );
      expect(fixture.state.writes).toHaveLength(0);

      const instanceB = await startDurableApp({
        mcpUrl: fixture.url,
        namespace,
        modelProvider: sharedProvider,
      });
      try {
        const clientB = instanceB.client();
        const guardedPlainTurn = await fetch(
          `${instanceB.apiUrl}/threads/${thread.thread_id}/runs`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user': 'user-a',
            },
            body: JSON.stringify({
              assistant_id: 'workos',
              input: {
                messages: [{ role: 'user', content: 'must not replace HITL' }],
              },
              if_thread_status: ['idle', 'error'],
            }),
          },
        );
        expect(guardedPlainTurn.status).toBe(409);
        expect(await guardedPlainTurn.text()).toContain(
          'thread_status_mismatch',
        );
        expect(fixture.state.writes).toHaveLength(0);

        const resumed = await clientB.runs.create(thread.thread_id, 'workos', {
          command: { resume: { decisions: [{ type: 'approve' }] } },
        });
        expect(resumed.run_id).not.toBe(interrupted.run_id);
        await waitForRunStatus(
          clientB,
          thread.thread_id,
          resumed.run_id,
          'success',
        );
        expect(fixture.state.writes).toEqual([
          { actor: 'user-a', value: 'multi-approved' },
        ]);
        const stateFromA = await clientA.threads.getState(thread.thread_id);
        const stateFromB = await clientB.threads.getState(thread.thread_id);
        expect(JSON.stringify(stateFromA.values)).toContain(
          'multi root complete',
        );
        expect(stateFromB.checkpoint.checkpoint_id).toBe(
          stateFromA.checkpoint.checkpoint_id,
        );
      } finally {
        await instanceB.close();
      }
    } finally {
      await instanceA.close();
      await fixture.close();
    }
  });

  test('persisted HITL interrupt를 runtime restart 뒤 새 run으로 resume하고 write를 한 번만 실행한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const namespace = `hitl-${randomUUID()}`;
    const first = await startDurableApp({
      mcpUrl: fixture.url,
      namespace,
      modelProvider: new IntegrationModelProvider(initialHitlModels()),
    });
    const firstClient = first.client();
    const thread = await firstClient.threads.create();
    const interruptedRun = await firstClient.runs.create(
      thread.thread_id,
      'workos',
      {
        input: { messages: [{ role: 'user', content: 'durable write' }] },
      },
    );
    await waitForRunStatus(
      firstClient,
      thread.thread_id,
      interruptedRun.run_id,
      'interrupted',
    );
    expect(fixture.state.writes).toHaveLength(0);
    const beforeRestart = await firstClient.threads.getState(thread.thread_id);
    expect(JSON.stringify(beforeRestart)).toContain('fixture_write');

    await first.close();

    const restarted = await startDurableApp({
      mcpUrl: fixture.url,
      namespace,
      modelProvider: new IntegrationModelProvider({
        root: fakeModel().respond(new AIMessage('root after restart')),
        researcher: unusedModel(),
        operator: fakeModel().respond(new AIMessage('operator after restart')),
      }),
    });
    try {
      const client = restarted.client();
      const persisted = await client.threads.getState(thread.thread_id);
      expect(JSON.stringify(persisted)).toContain('fixture_write');

      const resumed = await client.runs.create(thread.thread_id, 'workos', {
        command: { resume: { decisions: [{ type: 'approve' }] } },
      });
      expect(resumed.run_id).not.toBe(interruptedRun.run_id);
      await waitForRunStatus(
        client,
        thread.thread_id,
        resumed.run_id,
        'success',
      );

      expect(fixture.state.writes).toEqual([
        { actor: 'user-a', value: 'restart-approved' },
      ]);
      const history = await client.threads.getHistory(thread.thread_id);
      const serialized = JSON.stringify(history);
      expect(serialized).toContain('root after restart');
      expect(serialized).toContain('fixture_write');
    } finally {
      await restarted.close();
      await fixture.close();
    }
  });
});
