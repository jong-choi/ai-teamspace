import type { AgentModelProvider } from '@/agent/infrastructure/model/agent-model.provider';

import { jest } from '@jest/globals';
import { AIMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';

import { startWorkOsMcpFixture } from '@test/agent/fixtures/workos-mcp.fixture';
import {
  FixtureModelProvider,
  startAgentApp,
  unusedModel,
  waitForCondition,
  waitForRunStatus,
} from '@test/agent/support/workos-agent.e2e-support';

jest.setTimeout(30_000);

describe('WorkOS DeepAgent와 MCP fixture', () => {
  test('stock SDK run이 server-owned actor credential로 MCP read tool을 호출하고 token을 state에 남기지 않는다', async () => {
    const fixture = await startWorkOsMcpFixture();
    const root = fakeModel()
      .respondWithTools([
        { name: 'fixture_read', id: 'read-1', args: { query: 'alpha' } },
      ])
      .respond(new AIMessage('fixture read complete'));
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider({
        root,
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
    });

    try {
      const client = app.client('user-a');
      const thread = await client.threads.create();
      const output = await client.runs.wait(thread.thread_id, 'workos', {
        input: { messages: [{ role: 'user', content: 'read fixture' }] },
        config: {
          configurable: {
            langgraph_auth_user_id: 'attacker',
            langgraph_auth_permissions: ['admin'],
          },
        },
      });

      expect(JSON.stringify(output)).toContain('fixture read complete');
      expect(fixture.state.reads).toContainEqual({
        actor: 'user-a',
        query: 'alpha',
      });
      expect(
        fixture.state.reads.some((entry) => entry.actor === 'attacker'),
      ).toBe(false);

      const state = await client.threads.getState(thread.thread_id);
      const history = await client.threads.getHistory(thread.thread_id);
      const persisted = JSON.stringify({ state, history });
      expect(persisted).not.toContain('fixture:user-a');
      expect(persisted).not.toContain('attacker');
      await expect(
        app.client('user-b').threads.getState(thread.thread_id),
      ).rejects.toThrow('HTTP 404');
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('동시 user run이 actor별 MCP credential/session을 서로 격리한다', async () => {
    const fixture = await startWorkOsMcpFixture();
    const modelProvider: AgentModelProvider = {
      createModels: (actor) => {
        const actorId = actor?.userId ?? 'state';
        return {
          root: actor
            ? fakeModel()
                .respondWithTools([
                  {
                    name: 'fixture_read',
                    id: `read-${actorId}`,
                    args: { query: `query-${actorId}` },
                  },
                ])
                .respond(new AIMessage(`complete:${actorId}`))
            : unusedModel(),
          researcher: unusedModel(),
          operator: unusedModel(),
        };
      },
    };
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider,
    });

    try {
      const userA = app.client('user-a');
      const userB = app.client('user-b');
      const [threadA, threadB] = await Promise.all([
        userA.threads.create(),
        userB.threads.create(),
      ]);

      const [resultA, resultB] = await Promise.all([
        userA.runs.wait(threadA.thread_id, 'workos', {
          input: { messages: [{ role: 'user', content: 'read as A' }] },
        }),
        userB.runs.wait(threadB.thread_id, 'workos', {
          input: { messages: [{ role: 'user', content: 'read as B' }] },
        }),
      ]);

      expect(JSON.stringify(resultA)).toContain('complete:user-a');
      expect(JSON.stringify(resultB)).toContain('complete:user-b');
      expect(fixture.state.reads).toEqual(
        expect.arrayContaining([
          { actor: 'user-a', query: 'query-user-a' },
          { actor: 'user-b', query: 'query-user-b' },
        ]),
      );
      expect(fixture.state.reads).toHaveLength(2);
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('같은 researcher subagent 두 개를 한 step에서 병렬 실행한다', async () => {
    const fixture = await startWorkOsMcpFixture();
    const root = fakeModel()
      .respondWithTools([
        {
          name: 'task',
          id: 'research-1',
          args: { description: 'first research', subagent_type: 'researcher' },
        },
        {
          name: 'task',
          id: 'research-2',
          args: { description: 'second research', subagent_type: 'researcher' },
        },
      ])
      .respond(new AIMessage('parallel research complete'));
    const researcher = fakeModel()
      .respond(new AIMessage('first result'))
      .respond(new AIMessage('second result'));
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider({
        root,
        researcher,
        operator: unusedModel(),
      }),
    });

    try {
      const client = app.client('user-a');
      const thread = await client.threads.create();
      const run = await client.runs.create(thread.thread_id, 'workos', {
        input: { messages: [{ role: 'user', content: 'research twice' }] },
      });
      await waitForRunStatus(client, thread.thread_id, run.run_id, 'success');

      expect(researcher.callCount).toBe(2);
      const state = await client.threads.getState(thread.thread_id);
      expect(JSON.stringify(state.values)).toContain(
        'parallel research complete',
      );
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('background run cancel이 DeepAgent를 거쳐 MCP request AbortSignal까지 전달된다', async () => {
    const fixture = await startWorkOsMcpFixture();
    const root = fakeModel().respondWithTools([
      {
        name: 'fixture_wait',
        id: 'wait-1',
        args: { milliseconds: 5_000 },
      },
    ]);
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider({
        root,
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
    });

    try {
      const client = app.client('user-a');
      const thread = await client.threads.create();
      const run = await client.runs.create(thread.thread_id, 'workos', {
        input: { messages: [{ role: 'user', content: 'wait then cancel' }] },
      });
      await waitForRunStatus(client, thread.thread_id, run.run_id, 'running');
      await waitForCondition(
        () => fixture.state.waits.length === 1,
        'MCP wait tool이 시작되지 않았습니다.',
        { timeoutMs: 2_000 },
      );
      await client.runs.cancel(thread.thread_id, run.run_id, true);
      await waitForRunStatus(client, thread.thread_id, run.run_id, 'cancelled');

      await waitForCondition(
        () => fixture.state.waits.some((entry) => entry.cancelled),
        'cancel이 MCP AbortSignal까지 전달되지 않았습니다.',
        { timeoutMs: 2_000 },
      );
      expect(fixture.state.waits).toContainEqual({
        actor: 'user-a',
        cancelled: true,
      });
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('operator subagent의 write MCP tool은 실행 전에 nested HITL interrupt로 멈춘다', async () => {
    const fixture = await startWorkOsMcpFixture();
    const root = fakeModel().respondWithTools([
      {
        name: 'task',
        id: 'operator-1',
        args: { description: 'perform write', subagent_type: 'operator' },
      },
    ]);
    const operator = fakeModel().respondWithTools([
      {
        name: 'fixture_write',
        id: 'write-1',
        args: { value: 'consequential' },
      },
    ]);
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider({
        root,
        researcher: unusedModel(),
        operator,
      }),
    });

    try {
      const client = app.client('user-a');
      const thread = await client.threads.create();
      const run = await client.runs.create(thread.thread_id, 'workos', {
        input: { messages: [{ role: 'user', content: 'delegate write' }] },
      });
      await waitForRunStatus(
        client,
        thread.thread_id,
        run.run_id,
        'interrupted',
      );

      expect(fixture.state.writes).toHaveLength(0);
      const state = await client.threads.getState(thread.thread_id);
      const serialized = JSON.stringify(state);
      expect(serialized).toContain('fixture_write');
      expect(serialized).toContain('interrupt');
    } finally {
      await app.close();
      await fixture.close();
    }
  });
});
