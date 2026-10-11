import { AgentHttpException } from '@repo/agent-runtime';
import type { McpCredentialProvider } from '@/agent/infrastructure/mcp/mcp-credential.provider';
import type {
  AgentModelProvider,
  AgentModels,
} from '@/agent/infrastructure/model/agent-model.provider';

import { AIMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';
import { Client } from '@langchain/langgraph-sdk';
import { startTeamspaceMcpFixture } from '@test/agent/fixtures/teamspace-mcp.fixture';
import { startTeamspaceMcpProcessFixture } from '@test/agent/fixtures/teamspace-mcp-process.fixture';
import {
  createFixtureAgentAuth,
  FixtureModelProvider,
  startAgentApp as startSharedAgentApp,
  waitForCondition,
  waitForRunStatus,
} from '@test/agent/support/teamspace-agent.e2e-support';

jest.setTimeout(30_000);

function startAgentApp(mcpUrl: string, modelProvider: AgentModelProvider) {
  return startSharedAgentApp({ mcpUrl, modelProvider });
}

function canonicalWriteFlowModels(): AgentModels {
  return {
    root: fakeModel()
      .respondWithTools([
        {
          name: 'task',
          id: 'canonical-operator-task',
          args: {
            description: 'perform canonical wiki update',
            subagent_type: 'operator',
          },
        },
      ])
      .respond(new AIMessage('canonical root complete')),
    researcher: fakeModel().respond(new AIMessage('unused researcher')),
    operator: fakeModel()
      .respondWithTools([
        {
          name: 'wiki_document_update',
          id: 'canonical-write-action',
          args: {
            organizationId: 'organization-a',
            documentId: 'document-a',
            title: 'policy-approved',
          },
        },
      ])
      .respond(new AIMessage('canonical operator complete')),
  };
}

function writeFlowModels(): AgentModels {
  return {
    root: fakeModel()
      .respondWithTools([
        {
          name: 'task',
          id: 'operator-task',
          args: {
            description: 'perform fixture write',
            subagent_type: 'operator',
          },
        },
      ])
      .respond(new AIMessage('root complete')),
    researcher: fakeModel().respond(new AIMessage('unused researcher')),
    operator: fakeModel()
      .respondWithTools([
        {
          name: 'fixture_write',
          id: 'write-action',
          args: { value: 'approved-value' },
        },
      ])
      .respond(new AIMessage('operator complete')),
  };
}

async function createInterruptedWrite(
  client: Client,
): Promise<{ threadId: string; runId: string }> {
  const thread = await client.threads.create();
  const run = await client.runs.create(thread.thread_id, 'workos', {
    input: { messages: [{ role: 'user', content: 'write fixture' }] },
  });
  await waitForRunStatus(client, thread.thread_id, run.run_id, 'interrupted');
  return { threadId: thread.thread_id, runId: run.run_id };
}

function approveCommand() {
  return { resume: { decisions: [{ type: 'approve' as const }] } };
}

function rejectCommand() {
  return {
    resume: {
      decisions: [
        { type: 'reject' as const, message: 'fixture write rejected by user' },
      ],
    },
  };
}

describe('AI Teamspace Agent HITL 계약', () => {
  test('approve는 interrupted run과 다른 새 run으로 같은 thread를 재개하고 side effect를 정확히 한 번 실행한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp(
      fixture.url,
      new FixtureModelProvider(writeFlowModels()),
    );

    try {
      const client = app.client('user-a');
      const interrupted = await createInterruptedWrite(client);
      expect(fixture.state.writes).toHaveLength(0);

      const state = await client.threads.getState(interrupted.threadId);
      expect(JSON.stringify(state)).toContain('fixture_write');
      expect(JSON.stringify(state)).toContain('actionRequests');

      const resumed = await client.runs.create(interrupted.threadId, 'workos', {
        command: approveCommand(),
      });
      expect(resumed.run_id).not.toBe(interrupted.runId);
      await waitForRunStatus(
        client,
        interrupted.threadId,
        resumed.run_id,
        'success',
      );

      expect(fixture.state.writes).toEqual([
        { actor: 'user-a', value: 'approved-value' },
      ]);
      const resumedState = await client.threads.getState(interrupted.threadId);
      expect(JSON.stringify(resumedState.tasks)).not.toContain(
        'actionRequests',
      );
      const runs = await client.runs.list(interrupted.threadId, { limit: 10 });
      expect(runs.some((run) => run.run_id === interrupted.runId)).toBe(true);
      expect(runs.some((run) => run.run_id === resumed.run_id)).toBe(true);
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('reject는 새 run으로 재개하지만 write side effect를 실행하지 않는다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp(
      fixture.url,
      new FixtureModelProvider(writeFlowModels()),
    );

    try {
      const client = app.client('user-a');
      const interrupted = await createInterruptedWrite(client);
      const resumed = await client.runs.create(interrupted.threadId, 'workos', {
        command: rejectCommand(),
      });
      expect(resumed.run_id).not.toBe(interrupted.runId);
      await waitForRunStatus(
        client,
        interrupted.threadId,
        resumed.run_id,
        'success',
      );
      expect(fixture.state.writes).toHaveLength(0);
      const state = await client.threads.getState(interrupted.threadId);
      expect(JSON.stringify(state)).toContain('root complete');
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('edit decision은 승인 전 원본 write를 실행하지 않고 수정된 args로 정확히 한 번 실행한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp(
      fixture.url,
      new FixtureModelProvider(writeFlowModels()),
    );

    try {
      const client = app.client('user-a');
      const interrupted = await createInterruptedWrite(client);
      expect(fixture.state.writes).toHaveLength(0);

      const resumed = await client.runs.create(interrupted.threadId, 'workos', {
        command: {
          resume: {
            decisions: [
              {
                type: 'edit',
                editedAction: {
                  name: 'fixture_write',
                  args: { value: 'edited-value' },
                },
              },
            ],
          },
        },
      });
      expect(resumed.run_id).not.toBe(interrupted.runId);
      await waitForRunStatus(
        client,
        interrupted.threadId,
        resumed.run_id,
        'success',
      );
      expect(fixture.state.writes).toEqual([
        { actor: 'user-a', value: 'edited-value' },
      ]);
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('edit decision은 interrupted tool identity를 다른 tool로 바꿔치기하지 못한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp(
      fixture.url,
      new FixtureModelProvider(writeFlowModels()),
    );

    try {
      const client = app.client('user-a');
      const interrupted = await createInterruptedWrite(client);
      expect(fixture.state.writes).toHaveLength(0);
      expect(fixture.state.reads).toHaveLength(0);

      const resumed = await client.runs.create(interrupted.threadId, 'workos', {
        command: {
          resume: {
            decisions: [
              {
                type: 'edit',
                editedAction: {
                  name: 'fixture_read',
                  args: { query: 'identity-swap' },
                },
              },
            ],
          },
        },
      });
      await waitForCondition(
        async () => {
          const run = await client.runs.get(
            interrupted.threadId,
            resumed.run_id,
          );
          return ['error', 'cancelled', 'interrupted'].includes(run.status);
        },
        'tool identity를 바꾼 edit resume이 거부되지 않았습니다.',
        { timeoutMs: 8_000 },
      );

      expect(fixture.state.writes).toHaveLength(0);
      expect(fixture.state.reads).toHaveLength(0);
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('approve 직전 delegation이 revoke되면 current credential을 다시 확인하고 write를 실행하지 않는다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    let revoked = false;
    const credentials: McpCredentialProvider = {
      getCredential: ({ userId }) => {
        if (revoked) {
          throw new Error('AI Teamspace MCP delegation이 revoke되었습니다.');
        }
        return { token: async () => `fixture:${userId}` };
      },
    };
    const app = await startSharedAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider(writeFlowModels()),
      credentialProvider: credentials,
    });

    try {
      const client = app.client('user-a');
      const interrupted = await createInterruptedWrite(client);
      expect(fixture.state.writes).toHaveLength(0);

      revoked = true;
      const resumed = await client.runs.create(interrupted.threadId, 'workos', {
        command: approveCommand(),
      });
      await waitForCondition(
        async () => {
          const run = await client.runs.get(
            interrupted.threadId,
            resumed.run_id,
          );
          return run.status === 'error';
        },
        'delegation revoke 뒤 resume run이 error로 종료되지 않았습니다.',
        { timeoutMs: 8_000 },
      );

      expect(fixture.state.writes).toHaveLength(0);
      const state = await client.threads.getState(interrupted.threadId);
      const history = await client.threads.getHistory(interrupted.threadId);
      const serialized = JSON.stringify({ state, history });
      expect(serialized).toContain('fixture_write');
      expect(serialized).not.toContain('fixture:user-a');
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('approve 직전 MCP write policy가 revoke되면 새 inventory를 재확인하고 write를 실행하지 않는다', async () => {
    const fixture = await startTeamspaceMcpProcessFixture();
    const app = await startAgentApp(
      fixture.url,
      new FixtureModelProvider(canonicalWriteFlowModels()),
    );

    try {
      const client = app.client('user-a');
      const interrupted = await createInterruptedWrite(client);
      expect(fixture.writes).toHaveLength(0);

      fixture.setWriteAllowed(false);
      const resumed = await client.runs.create(interrupted.threadId, 'workos', {
        command: approveCommand(),
      });
      await waitForRunStatus(
        client,
        interrupted.threadId,
        resumed.run_id,
        'success',
      );
      expect(fixture.writeAttempts).toEqual([
        {
          actor: 'user-a',
          organizationId: 'organization-a',
          documentId: 'document-a',
          title: 'policy-approved',
        },
      ]);
      expect(fixture.writes).toHaveLength(0);
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('approve 직전 organization membership이 revoke되면 resume을 거부하고 interrupt를 보존한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    let membershipActive = true;
    const auth = createFixtureAgentAuth((identity, organizationId) => {
      if (
        !membershipActive &&
        identity === 'user-a' &&
        organizationId === 'organization-a'
      ) {
        throw new AgentHttpException(403, {
          message: '조직 membership이 필요합니다.',
        });
      }
    });
    const app = await startSharedAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider(writeFlowModels()),
      auth,
    });

    try {
      const client = app.client('user-a', 'organization-a');
      const interrupted = await createInterruptedWrite(client);
      expect(fixture.state.writes).toHaveLength(0);

      membershipActive = false;
      await expect(
        client.runs.create(interrupted.threadId, 'workos', {
          command: approveCommand(),
        }),
      ).rejects.toThrow('HTTP 403');
      expect(fixture.state.writes).toHaveLength(0);

      membershipActive = true;
      const state = await client.threads.getState(interrupted.threadId);
      expect(JSON.stringify(state)).toContain('fixture_write');
      expect(JSON.stringify(state)).toContain('actionRequests');
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('같은 interrupt에 approve를 동시에 두 번 보내도 write side effect는 한 번만 실행된다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp(
      fixture.url,
      new FixtureModelProvider(writeFlowModels()),
    );

    try {
      const client = app.client('user-a');
      const interrupted = await createInterruptedWrite(client);
      const attempts = await Promise.allSettled([
        client.runs.create(interrupted.threadId, 'workos', {
          command: approveCommand(),
        }),
        client.runs.create(interrupted.threadId, 'workos', {
          command: approveCommand(),
        }),
      ]);
      const runIds = attempts.flatMap((attempt) =>
        attempt.status === 'fulfilled' ? [attempt.value.run_id] : [],
      );

      expect(runIds.length).toBeGreaterThan(0);
      await waitForCondition(
        async () => {
          const runs = await Promise.all(
            runIds.map((runId) => client.runs.get(interrupted.threadId, runId)),
          );
          return runs.every((run) =>
            [
              'success',
              'error',
              'cancelled',
              'timeout',
              'interrupted',
            ].includes(run.status),
          );
        },
        'double approve resume run들이 terminal 상태로 정리되지 않았습니다.',
        { timeoutMs: 8_000 },
      );

      const statuses = await Promise.all(
        runIds.map(async (runId) => {
          const run = await client.runs.get(interrupted.threadId, runId);
          return run.status;
        }),
      );
      expect(statuses.filter((status) => status === 'success')).toHaveLength(1);
      expect(fixture.state.writes).toEqual([
        { actor: 'user-a', value: 'approved-value' },
      ]);
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('approve resume과 cancel이 경쟁해도 write side effect는 최대 한 번만 실행된다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp(
      fixture.url,
      new FixtureModelProvider(writeFlowModels()),
    );

    try {
      const client = app.client('user-a');
      const interrupted = await createInterruptedWrite(client);
      const resumed = await client.runs.create(interrupted.threadId, 'workos', {
        command: approveCommand(),
      });

      await Promise.allSettled([
        client.runs.cancel(interrupted.threadId, resumed.run_id, true),
        client.runs.get(interrupted.threadId, resumed.run_id),
      ]);
      await waitForCondition(
        async () => {
          const run = await client.runs.get(
            interrupted.threadId,
            resumed.run_id,
          );
          return ['success', 'cancelled', 'error', 'timeout'].includes(
            run.status,
          );
        },
        'approve/cancel 경쟁 run이 terminal 상태로 정리되지 않았습니다.',
        { timeoutMs: 8_000 },
      );

      expect(fixture.state.writes.length).toBeLessThanOrEqual(1);
      if (fixture.state.writes.length === 1) {
        expect(fixture.state.writes[0]).toEqual({
          actor: 'user-a',
          value: 'approved-value',
        });
      }
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('완료된 interrupt의 approve payload를 다시 replay해도 write를 재실행하지 않는다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp(
      fixture.url,
      new FixtureModelProvider(writeFlowModels()),
    );

    try {
      const client = app.client('user-a');
      const interrupted = await createInterruptedWrite(client);
      const resumed = await client.runs.create(interrupted.threadId, 'workos', {
        command: approveCommand(),
      });
      await waitForRunStatus(
        client,
        interrupted.threadId,
        resumed.run_id,
        'success',
      );
      expect(fixture.state.writes).toHaveLength(1);

      const replay = await Promise.allSettled([
        client.runs.create(interrupted.threadId, 'workos', {
          command: approveCommand(),
        }),
      ]);
      const replayResult = replay[0];
      if (replayResult?.status === 'fulfilled') {
        const replayRunId = replayResult.value.run_id;
        await waitForCondition(
          async () => {
            const run = await client.runs.get(
              interrupted.threadId,
              replayRunId,
            );
            return ['error', 'cancelled', 'timeout', 'success'].includes(
              run.status,
            );
          },
          'completed interrupt replay run이 정리되지 않았습니다.',
          { timeoutMs: 8_000 },
        );
      }

      expect(fixture.state.writes).toEqual([
        { actor: 'user-a', value: 'approved-value' },
      ]);
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('interrupted thread의 plain turn은 if_thread_status precondition으로 atomic 409가 된다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp(
      fixture.url,
      new FixtureModelProvider(writeFlowModels()),
    );

    try {
      const client = app.client('user-a');
      const interrupted = await createInterruptedWrite(client);
      const before = await client.runs.list(interrupted.threadId, {
        limit: 10,
      });
      const response = await fetch(
        `${app.apiUrl}/threads/${interrupted.threadId}/runs`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user': 'user-a',
          },
          body: JSON.stringify({
            assistant_id: 'workos',
            input: {
              messages: [{ role: 'user', content: 'overwrite pending HITL' }],
            },
            if_thread_status: ['idle', 'error'],
          }),
        },
      );
      expect(response.status).toBe(409);
      expect(await response.text()).toContain('thread_status_mismatch');
      const after = await client.runs.list(interrupted.threadId, { limit: 10 });
      expect(after).toHaveLength(before.length);
      expect(fixture.state.writes).toHaveLength(0);
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('같은 사용자의 다른 thread에는 stolen resume payload를 주입할 수 없다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp(
      fixture.url,
      new FixtureModelProvider(writeFlowModels()),
    );

    try {
      const client = app.client('user-a');
      const interrupted = await createInterruptedWrite(client);
      const otherThread = await client.threads.create();

      const attempt = await client.runs.create(
        otherThread.thread_id,
        'workos',
        {
          command: approveCommand(),
        },
      );
      await waitForCondition(
        async () => {
          const run = await client.runs.get(
            otherThread.thread_id,
            attempt.run_id,
          );
          return ['error', 'cancelled', 'timeout'].includes(run.status);
        },
        '다른 thread의 stolen resume payload가 거부되지 않았습니다.',
        { timeoutMs: 8_000 },
      );

      expect(fixture.state.writes).toHaveLength(0);
      const originalState = await client.threads.getState(interrupted.threadId);
      expect(JSON.stringify(originalState)).toContain('actionRequests');
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('다른 사용자 또는 다른 조직은 interrupted thread를 resume하거나 기존 run을 조회/취소할 수 없다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp(
      fixture.url,
      new FixtureModelProvider(writeFlowModels()),
    );

    try {
      const owner = app.client('user-a', 'organization-a');
      const interrupted = await createInterruptedWrite(owner);
      const unauthorizedClients = [
        app.client('user-b', 'organization-a'),
        app.client('user-a', 'organization-b'),
      ];

      for (const attacker of unauthorizedClients) {
        await expect(
          attacker.runs.create(interrupted.threadId, 'workos', {
            command: approveCommand(),
          }),
        ).rejects.toThrow('HTTP 404');
        await expect(
          attacker.runs.get(interrupted.threadId, interrupted.runId),
        ).rejects.toThrow('HTTP 404');
        await expect(
          attacker.runs.cancel(interrupted.threadId, interrupted.runId, true),
        ).rejects.toThrow('HTTP 404');
        const unauthorizedStream = attacker.runs.joinStream(
          interrupted.threadId,
          interrupted.runId,
          { streamMode: 'values' },
        );
        await expect(unauthorizedStream.next()).rejects.toThrow('HTTP 404');
      }
      expect(fixture.state.writes).toHaveLength(0);
    } finally {
      await app.close();
      await fixture.close();
    }
  });
});
