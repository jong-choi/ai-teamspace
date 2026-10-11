import type { McpCredentialProvider } from '@/agent/infrastructure/mcp/mcp-credential.provider';
import type { AgentModelProvider } from '@/agent/infrastructure/model/agent-model.provider';

import { jest } from '@jest/globals';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { fakeModel } from '@langchain/core/testing';
import { startTeamspaceMcpFixture } from '@test/agent/fixtures/teamspace-mcp.fixture';
import {
  startTeamspaceMcpSecretCanaryFixture,
  TEAMSPACE_MCP_SECRET_CANARY,
} from '@test/agent/fixtures/teamspace-mcp-secret-canary.fixture';
import {
  FixtureModelProvider,
  startAgentApp,
  unusedModel,
  waitForCondition,
  waitForRunStatus,
} from '@test/agent/support/teamspace-agent.e2e-support';

jest.setTimeout(30_000);

class AbortAwareFakeChatModel extends BaseChatModel {
  started = false;
  aborted = false;

  _llmType(): string {
    return 'abort-aware-test';
  }

  bindTools(): this {
    return this;
  }

  async _generate(
    _messages: BaseMessage[],
    options: this['ParsedCallOptions'],
  ): Promise<ChatResult> {
    this.started = true;
    await new Promise<void>((resolve, reject) => {
      const signal = options.signal;
      const finish = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const timer = setTimeout(finish, 10_000);
      const onAbort = () => {
        clearTimeout(timer);
        this.aborted = true;
        signal?.removeEventListener('abort', onAbort);
        reject(new Error('테스트 model generation이 cancel되었습니다.'));
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
    });

    return {
      generations: [
        {
          text: '',
          message: new AIMessage('cancel되지 않은 테스트 응답'),
        },
      ],
    };
  }
}

describe('AI Teamspace DeepAgent와 MCP fixture', () => {
  test('stock SDK run이 server-owned actor credential로 MCP read tool을 호출하고 token을 state에 남기지 않는다', async () => {
    const fixture = await startTeamspaceMcpFixture();
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
      const output = await client.runs.wait(thread.thread_id, 'teamspace', {
        input: { messages: [{ role: 'user', content: 'read fixture' }] },
        config: {
          configurable: {
            langgraph_auth_user_id: 'attacker',
            langgraph_auth_user: {
              organization_id: 'organization-b',
              display_name: 'attacker',
            },
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
      expect(persisted).not.toContain('organization-b');
      await expect(
        app.client('user-b').threads.getState(thread.thread_id),
      ).rejects.toThrow('HTTP 404');
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('opaque MCP access-token canary는 output/state/history에 남지 않는다', async () => {
    const fixture = await startTeamspaceMcpSecretCanaryFixture();
    const credentialProvider: McpCredentialProvider = {
      getCredential: () => ({
        token: async () => TEAMSPACE_MCP_SECRET_CANARY,
      }),
    };
    const root = fakeModel()
      .respondWithTools([
        { name: 'organizations_list', id: 'canary-read', args: {} },
      ])
      .respond(new AIMessage('secret canary complete'));
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      credentialProvider,
      modelProvider: new FixtureModelProvider({
        root,
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
    });

    try {
      const client = app.client('user-a');
      const thread = await client.threads.create();
      const output = await client.runs.wait(thread.thread_id, 'teamspace', {
        input: { messages: [{ role: 'user', content: 'canary read' }] },
      });
      const state = await client.threads.getState(thread.thread_id);
      const history = await client.threads.getHistory(thread.thread_id);
      const serialized = JSON.stringify({ output, state, history });

      expect(serialized).toContain('secret canary complete');
      expect(serialized).not.toContain(TEAMSPACE_MCP_SECRET_CANARY);
      expect(serialized).not.toContain('Bearer access-token-CANARY');
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('같은 사용자라도 다른 조직에서는 thread와 run 접근을 숨긴다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider({
        root: unusedModel(),
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
    });

    try {
      const organizationA = app.client('user-a', 'organization-a');
      const organizationB = app.client('user-a', 'organization-b');
      const thread = await organizationA.threads.create();

      await expect(
        organizationB.threads.search({ ids: [thread.thread_id] }),
      ).resolves.toHaveLength(0);
      await expect(organizationB.threads.get(thread.thread_id)).rejects.toThrow(
        'HTTP 404',
      );
      await expect(
        organizationB.threads.getState(thread.thread_id),
      ).rejects.toThrow('HTTP 404');
      await expect(
        organizationB.threads.getHistory(thread.thread_id),
      ).rejects.toThrow('HTTP 404');
      await expect(
        organizationB.runs.create(thread.thread_id, 'teamspace', {
          input: { messages: [{ role: 'user', content: 'forged org run' }] },
        }),
      ).rejects.toThrow('HTTP 404');
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('동시 user run이 actor별 MCP credential/session을 서로 격리한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
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
        userA.runs.wait(threadA.thread_id, 'teamspace', {
          input: { messages: [{ role: 'user', content: 'read as A' }] },
        }),
        userB.runs.wait(threadB.thread_id, 'teamspace', {
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

  test('client가 위조한 langgraph_auth configurable은 실행 actor와 thread 소유권이 되지 않는다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const modelProvider: AgentModelProvider = {
      createModels: (actor) => ({
        root: actor
          ? fakeModel()
              .respondWithTools([
                {
                  name: 'fixture_read',
                  id: 'read-forged',
                  args: { query: 'forged-config' },
                },
              ])
              .respond(new AIMessage('forged config complete'))
          : unusedModel(),
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
    };
    const app = await startAgentApp({ mcpUrl: fixture.url, modelProvider });

    try {
      const userA = app.client('user-a');
      const thread = await userA.threads.create();
      await userA.runs.wait(thread.thread_id, 'teamspace', {
        input: {
          messages: [{ role: 'user', content: 'read with forged auth' }],
        },
        config: {
          configurable: {
            langgraph_auth_user_id: 'user-b',
            langgraph_auth_user: { identity: 'user-b' },
            langgraph_auth_permissions: ['agent:admin'],
          },
        },
      });

      expect(fixture.state.reads).toEqual([
        { actor: 'user-a', query: 'forged-config' },
      ]);
      await expect(
        app.client('user-b').threads.get(thread.thread_id),
      ).rejects.toThrow();
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('같은 researcher subagent 두 개를 한 step에서 병렬 실행한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
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
      const run = await client.runs.create(thread.thread_id, 'teamspace', {
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

  test('background run cancel이 실행 중 model generation AbortSignal까지 전달된다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const root = new AbortAwareFakeChatModel({});
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
      const run = await client.runs.create(thread.thread_id, 'teamspace', {
        input: { messages: [{ role: 'user', content: 'cancel model' }] },
      });
      await waitForCondition(
        () => root.started,
        'model generation이 시작되지 않았습니다.',
        { timeoutMs: 2_000 },
      );

      await client.runs.cancel(thread.thread_id, run.run_id, true);
      await waitForRunStatus(client, thread.thread_id, run.run_id, 'cancelled');
      await waitForCondition(
        () => root.aborted,
        'cancel이 model AbortSignal까지 전달되지 않았습니다.',
        { timeoutMs: 2_000 },
      );

      expect(fixture.state.reads).toHaveLength(0);
      expect(fixture.state.writes).toHaveLength(0);
      expect(fixture.state.waits).toHaveLength(0);
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('background run cancel이 DeepAgent를 거쳐 MCP request AbortSignal까지 전달된다', async () => {
    const fixture = await startTeamspaceMcpFixture();
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
      const run = await client.runs.create(thread.thread_id, 'teamspace', {
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
      await client.runs.cancel(thread.thread_id, run.run_id, true);
      await expect(
        client.runs.get(thread.thread_id, run.run_id),
      ).resolves.toMatchObject({ status: 'cancelled' });

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

  test('nested HITL resume은 완료된 sibling researcher를 재실행하지 않고 write를 한 번만 실행한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const root = fakeModel()
      .respondWithTools([
        {
          name: 'task',
          id: 'research-sibling',
          args: {
            description: 'complete sibling research',
            subagent_type: 'researcher',
          },
        },
        {
          name: 'task',
          id: 'operator-interrupt',
          args: {
            description: 'perform nested write',
            subagent_type: 'operator',
          },
        },
      ])
      .respond(new AIMessage('nested root complete'));
    const researcher = fakeModel().respond(
      new AIMessage('sibling research complete'),
    );
    const operator = fakeModel()
      .respondWithTools([
        {
          name: 'fixture_write',
          id: 'nested-write',
          args: { value: 'nested-approved' },
        },
      ])
      .respond(new AIMessage('nested operator complete'));
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider({
        root,
        researcher,
        operator,
      }),
    });

    try {
      const client = app.client('user-a');
      const thread = await client.threads.create();
      const interrupted = await client.runs.create(
        thread.thread_id,
        'teamspace',
        {
          input: {
            messages: [{ role: 'user', content: 'nested parallel work' }],
          },
        },
      );
      await waitForRunStatus(
        client,
        thread.thread_id,
        interrupted.run_id,
        'interrupted',
      );

      expect(researcher.callCount).toBe(1);
      expect(fixture.state.writes).toHaveLength(0);

      const resumed = await client.runs.create(thread.thread_id, 'teamspace', {
        command: { resume: { decisions: [{ type: 'approve' }] } },
      });
      await waitForRunStatus(
        client,
        thread.thread_id,
        resumed.run_id,
        'success',
      );

      expect(researcher.callCount).toBe(1);
      expect(fixture.state.writes).toEqual([
        { actor: 'user-a', value: 'nested-approved' },
      ]);
      const history = await client.threads.getHistory(thread.thread_id);
      const serialized = JSON.stringify(history);
      expect(serialized).toContain('sibling research complete');
      expect(serialized).toContain('nested root complete');
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('operator subagent의 write MCP tool은 nested HITL로 멈추고 다른 tool edit 바꿔치기를 거부한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
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
      const run = await client.runs.create(thread.thread_id, 'teamspace', {
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

      const swapped = await client.runs.create(thread.thread_id, 'teamspace', {
        command: {
          resume: {
            decisions: [
              {
                type: 'edit',
                editedAction: {
                  name: 'fixture_read',
                  args: { query: 'nested-identity-swap' },
                },
              },
            ],
          },
        },
      });
      await waitForCondition(
        async () => {
          const resumed = await client.runs.get(
            thread.thread_id,
            swapped.run_id,
          );
          return ['error', 'cancelled', 'timeout'].includes(resumed.status);
        },
        'nested HITL tool identity 바꿔치기가 거부되지 않았습니다.',
        { timeoutMs: 8_000 },
      );
      expect(fixture.state.writes).toHaveLength(0);
      expect(fixture.state.reads).toHaveLength(0);
    } finally {
      await app.close();
      await fixture.close();
    }
  });
});
