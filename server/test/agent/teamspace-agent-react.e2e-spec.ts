import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentModels } from '@/agent/infrastructure/model/agent-model.provider';

import { jest } from '@jest/globals';
import { AIMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';
import {
  type DeepAgentTypeConfigLike,
  type ResolveStreamInterface,
  useStream,
} from '@langchain/langgraph-sdk/react';
import { startTeamspaceMcpFixture } from '@test/agent/fixtures/teamspace-mcp.fixture';
import {
  FixtureModelProvider,
  startAgentApp,
  unusedModel,
  waitForCondition as waitForSharedCondition,
} from '@test/agent/support/teamspace-agent.e2e-support';

jest.setTimeout(30_000);

function hitlModels(): AgentModels {
  return {
    root: fakeModel()
      .respondWithTools([
        {
          name: 'task',
          id: 'react-hitl-task',
          args: {
            description: 'perform react write',
            subagent_type: 'operator',
          },
        },
      ])
      .respond(new AIMessage('react HITL complete')),
    researcher: unusedModel(),
    operator: fakeModel()
      .respondWithTools([
        {
          name: 'fixture_write',
          id: 'react-hitl-write',
          args: { value: 'react-approved' },
        },
      ])
      .respond(new AIMessage('react operator complete')),
  };
}

function memoryRunStorage(): RunMetadataStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function waitForCondition(
  condition: () => boolean,
  message: string,
  timeoutMs = 5_000,
): Promise<void> {
  return waitForSharedCondition(condition, message, {
    timeoutMs,
    pause: () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }),
  });
}

type TeamspaceDeepAgent = {
  readonly '~agentTypes': DeepAgentTypeConfigLike;
  readonly '~deepAgentTypes': DeepAgentTypeConfigLike;
};
type StreamState = ResolveStreamInterface<TeamspaceDeepAgent>;

interface HarnessProps {
  apiUrl: string;
  threadId?: string | null;
  reconnectOnMount?: boolean | (() => RunMetadataStorage);
  onThreadId?: (threadId: string) => void;
  onRender: (stream: StreamState) => void;
}

interface RunMetadataStorage {
  getItem(key: `lg:stream:${string}`): string | null;
  setItem(key: `lg:stream:${string}`, value: string): void;
  removeItem(key: `lg:stream:${string}`): void;
}

function Harness({
  apiUrl,
  threadId,
  reconnectOnMount,
  onThreadId,
  onRender,
}: HarnessProps) {
  const stream = useStream<TeamspaceDeepAgent>({
    apiUrl,
    assistantId: 'workos',
    defaultHeaders: { 'x-test-user': 'user-a' },
    fetchStateHistory: true,
    ...(threadId !== undefined ? { threadId } : {}),
    ...(reconnectOnMount !== undefined ? { reconnectOnMount } : {}),
    ...(onThreadId ? { onThreadId } : {}),
  });
  onRender(stream);
  return null;
}

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe('AI Teamspace DeepAgent React SDK 투영', () => {
  let renderer: ReactTestRenderer | undefined;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  const originalConsoleError = console.error;

  beforeEach(() => {
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation((...args) => {
        const rendered = args.map((value) => String(value)).join(' ');
        if (
          rendered.includes('react-test-renderer is deprecated') ||
          rendered.includes('AbortError')
        ) {
          return;
        }
        originalConsoleError(...args);
      });
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer?.unmount());
      renderer = undefined;
    }
    consoleErrorSpy.mockRestore();
  });

  afterAll(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  test('MCP tool call/result와 assistant final message를 stock useStream에 투영한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider({
        root: fakeModel()
          .respondWithTools([
            {
              name: 'fixture_read',
              id: 'react-read-1',
              args: { query: 'react-tool' },
            },
          ])
          .respond(new AIMessage('react tool complete')),
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
    });
    let current: StreamState | undefined;

    try {
      await act(async () => {
        renderer = create(
          createElement(Harness, {
            apiUrl: app.apiUrl,
            onRender: (stream: StreamState) => {
              current = stream;
            },
          }),
        );
      });

      await act(async () => {
        await current?.submit({
          messages: [{ type: 'human', content: 'read through MCP' }],
        });
      });

      expect(current?.isLoading).toBe(false);
      expect(JSON.stringify(current?.messages)).toContain(
        'react tool complete',
      );
      const projectedTools = JSON.stringify(current?.toolCalls);
      expect(projectedTools).toContain('fixture_read');
      expect(projectedTools).toContain('read:user-a:react-tool');
      expect(fixture.state.reads).toContainEqual({
        actor: 'user-a',
        query: 'react-tool',
      });
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('MCP tool error를 stock useStream tool projection에 남기고 credential은 노출하지 않는다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider({
        root: fakeModel()
          .respondWithTools([
            {
              name: 'fixture_fail',
              id: 'react-fail-1',
              args: { code: 'react-error' },
            },
          ])
          .respond(new AIMessage('tool failure observed')),
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
    });
    let current: StreamState | undefined;

    try {
      await act(async () => {
        renderer = create(
          createElement(Harness, {
            apiUrl: app.apiUrl,
            onRender: (stream: StreamState) => {
              current = stream;
            },
          }),
        );
      });

      await act(async () => {
        await current
          ?.submit({
            messages: [{ type: 'human', content: 'trigger tool error' }],
          })
          .catch(() => undefined);
      });

      const projectedTools = JSON.stringify(current?.toolCalls);
      expect(projectedTools).toContain('fixture_fail');
      expect(projectedTools).toContain('fixture conflict:react-error');
      expect(projectedTools).not.toContain('fixture:user-a');
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test('진행 중 resumable run에서 unmount 후 remount하면 같은 run에 재연결하고 tool을 중복 실행하지 않는다', async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      'window',
    );
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    });
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider({
        root: fakeModel()
          .respondWithTools([
            {
              name: 'fixture_wait',
              id: 'react-reconnect-wait',
              args: { milliseconds: 800 },
            },
          ])
          .respond(new AIMessage('reconnected run complete')),
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
    });
    const storage = memoryRunStorage();
    let current: StreamState | undefined;
    let threadId: string | undefined;
    let firstSubmit: Promise<void> | undefined;

    try {
      await act(async () => {
        renderer = create(
          createElement(Harness, {
            apiUrl: app.apiUrl,
            reconnectOnMount: () => storage,
            onThreadId: (nextThreadId: string) => {
              threadId = nextThreadId;
            },
            onRender: (stream: StreamState) => {
              current = stream;
            },
          }),
        );
      });
      await act(async () => {
        firstSubmit = current
          ?.submit({
            messages: [{ type: 'human', content: 'wait across remount' }],
          })
          .catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await waitForCondition(
        () => fixture.state.waits.length === 1 && threadId !== undefined,
        'reconnect 대상 run이 시작되지 않았습니다.',
      );

      await act(async () => renderer?.unmount());
      renderer = undefined;
      const remounted = { current: undefined as StreamState | undefined };
      await act(async () => {
        renderer = create(
          createElement(Harness, {
            apiUrl: app.apiUrl,
            threadId,
            reconnectOnMount: () => storage,
            onRender: (stream: StreamState) => {
              remounted.current = stream;
            },
          }),
        );
      });
      await waitForCondition(
        () =>
          remounted.current !== undefined &&
          !remounted.current.isLoading &&
          JSON.stringify(remounted.current.messages).includes(
            'reconnected run complete',
          ),
        'remount 뒤 active run 재연결이 완료되지 않았습니다.',
        8_000,
      );
      await firstSubmit;
      expect(fixture.state.waits).toHaveLength(1);
      expect(JSON.stringify(remounted.current?.messages)).toContain(
        'reconnected run complete',
      );
      expect(remounted.current?.error).toBeUndefined();
    } finally {
      await app.close();
      await fixture.close();
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  test('stock useStream stop은 resumable background run을 cancel하고 MCP AbortSignal까지 전달한다', async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      'window',
    );
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    });
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider({
        root: fakeModel().respondWithTools([
          {
            name: 'fixture_wait',
            id: 'react-stop-wait',
            args: { milliseconds: 5_000 },
          },
        ]),
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
    });
    const storage = memoryRunStorage();
    let current: StreamState | undefined;
    let submitPromise: Promise<void> | undefined;

    try {
      await act(async () => {
        renderer = create(
          createElement(Harness, {
            apiUrl: app.apiUrl,
            reconnectOnMount: () => storage,
            onRender: (stream: StreamState) => {
              current = stream;
            },
          }),
        );
      });
      await act(async () => {
        submitPromise = current
          ?.submit({
            messages: [{ type: 'human', content: 'stop this run' }],
          })
          .catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await waitForCondition(
        () => fixture.state.waits.length === 1,
        'stop 대상 MCP tool이 시작되지 않았습니다.',
      );

      await act(async () => {
        await current?.stop();
      });
      await submitPromise;
      await waitForCondition(
        () => fixture.state.waits.some((entry) => entry.cancelled),
        'useStream stop이 MCP AbortSignal까지 전달되지 않았습니다.',
      );
      expect(current?.isLoading).toBe(false);
      expect(fixture.state.waits).toEqual([
        { actor: 'user-a', cancelled: true },
      ]);
    } finally {
      await app.close();
      await fixture.close();
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  test('interrupted thread를 remount하면 HITL payload를 복구하고 command resume 뒤 write를 한 번만 실행한다', async () => {
    const fixture = await startTeamspaceMcpFixture();
    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider(hitlModels()),
    });
    let current: StreamState | undefined;
    let threadId: string | undefined;

    try {
      await act(async () => {
        renderer = create(
          createElement(Harness, {
            apiUrl: app.apiUrl,
            onThreadId: (nextThreadId: string) => {
              threadId = nextThreadId;
            },
            onRender: (stream: StreamState) => {
              current = stream;
            },
          }),
        );
      });
      await act(async () => {
        await current?.submit({
          messages: [{ type: 'human', content: 'write with approval' }],
        });
      });
      expect(threadId).toBeDefined();
      expect(current?.interrupts.length).toBeGreaterThan(0);
      expect(JSON.stringify(current?.interrupts)).toContain('fixture_write');
      expect(fixture.state.writes).toHaveLength(0);

      await act(async () => renderer?.unmount());
      renderer = undefined;
      const remounted = { current: undefined as StreamState | undefined };

      await act(async () => {
        renderer = create(
          createElement(Harness, {
            apiUrl: app.apiUrl,
            threadId,
            onRender: (stream: StreamState) => {
              remounted.current = stream;
            },
          }),
        );
      });
      await waitForCondition(
        () =>
          remounted.current !== undefined && !remounted.current.isThreadLoading,
        'remount 뒤 thread state를 불러오지 못했습니다.',
      );
      expect(remounted.current?.interrupts.length).toBeGreaterThan(0);
      expect(JSON.stringify(remounted.current?.interrupts)).toContain(
        'fixture_write',
      );

      await act(async () => {
        await remounted.current?.submit(undefined, {
          command: { resume: { decisions: [{ type: 'approve' }] } },
        });
      });
      expect(remounted.current?.isLoading).toBe(false);
      expect(remounted.current?.interrupts).toHaveLength(0);
      expect(JSON.stringify(remounted.current?.messages)).toContain(
        'react HITL complete',
      );
      expect(fixture.state.writes).toEqual([
        { actor: 'user-a', value: 'react-approved' },
      ]);
    } finally {
      await app.close();
      await fixture.close();
    }
  });
});
