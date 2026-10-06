import type {
  AgentModelProvider,
  AgentModels,
} from '#server/agent/infrastructure/model/agent-model.provider.js';

import { AIMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';
import { Client } from '@langchain/langgraph-sdk';

import { startWorkOsMcpFixture } from '#server-test/agent/fixtures/workos-mcp.fixture.js';
import {
  FixtureModelProvider,
  startAgentApp as startSharedAgentApp,
  waitForRunStatus,
} from '#server-test/agent/support/workos-agent.e2e-support.js';

jest.setTimeout(30_000);

function startAgentApp(mcpUrl: string, modelProvider: AgentModelProvider) {
  return startSharedAgentApp({ mcpUrl, modelProvider });
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

describe('WorkOS Agent HITL 계약', () => {
  test('approve는 interrupted run과 다른 새 run으로 같은 thread를 재개하고 side effect를 정확히 한 번 실행한다', async () => {
    const fixture = await startWorkOsMcpFixture();
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
    const fixture = await startWorkOsMcpFixture();
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
    const fixture = await startWorkOsMcpFixture();
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

  test('interrupted thread의 plain turn은 if_thread_status precondition으로 atomic 409가 된다', async () => {
    const fixture = await startWorkOsMcpFixture();
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

  test('다른 사용자는 interrupted thread를 resume하거나 기존 run을 조회/취소할 수 없다', async () => {
    const fixture = await startWorkOsMcpFixture();
    const app = await startAgentApp(
      fixture.url,
      new FixtureModelProvider(writeFlowModels()),
    );

    try {
      const owner = app.client('user-a');
      const attacker = app.client('user-b');
      const interrupted = await createInterruptedWrite(owner);

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
      expect(fixture.state.writes).toHaveLength(0);
    } finally {
      await app.close();
      await fixture.close();
    }
  });
});
