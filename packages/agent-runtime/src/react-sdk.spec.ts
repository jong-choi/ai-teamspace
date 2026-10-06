import type { AddressInfo } from 'node:net';

import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { embedInMemoryGraphs } from '@repo/agent-runtime/server-kit';

import { jest } from '@jest/globals';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { MessagesAnnotation, StateGraph } from '@langchain/langgraph';
import { useStream } from '@langchain/langgraph-sdk/react';

import { AgentRuntimeModule } from '#agent-runtime/nest/agent-runtime.module.js';

function echo(state: typeof MessagesAnnotation.State): {
  messages: BaseMessage[];
} {
  const lastMessage = state.messages.at(-1);
  const text =
    typeof lastMessage?.content === 'string' ? lastMessage.content : '';
  return { messages: [new AIMessage(`echo: ${text}`)] };
}

const echoGraph = new StateGraph(MessagesAnnotation)
  .addNode('echo', echo)
  .addEdge('__start__', 'echo')
  .addEdge('echo', '__end__')
  .compile();

const errorGraph = new StateGraph(MessagesAnnotation)
  .addNode('fail', () => {
    throw new Error('의도한 graph 오류');
  })
  .addEdge('__start__', 'fail')
  .addEdge('fail', '__end__')
  .compile();

const deps = embedInMemoryGraphs({ agent: echoGraph, error: errorGraph });

@Module({
  imports: [AgentRuntimeModule.forRoot({ runtime: { deps } })],
})
class ReactSdkTestModule {}

type StreamState = ReturnType<typeof useStream>;

interface HarnessProps {
  apiUrl: string;
  assistantId: string;
  onRender: (stream: StreamState) => void;
}

function Harness({ apiUrl, assistantId, onRender }: HarnessProps) {
  const stream = useStream({ apiUrl, assistantId });
  onRender(stream);
  return null;
}

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe('LangGraph React SDK useStream 호환성', () => {
  let app: INestApplication;
  let apiUrl: string;
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
          rendered.includes('의도한 graph 오류')
        ) {
          return;
        }
        originalConsoleError(...args);
      });
  });

  beforeAll(async () => {
    app = await NestFactory.create(ReactSdkTestModule, {
      bodyParser: false,
      logger: false,
    });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    apiUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
      renderer = undefined;
    }
    consoleErrorSpy.mockRestore();
  });

  afterAll(async () => {
    await app.close();
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  test('submit이 loading 상태와 assistant message, final values를 stock hook에 투영한다', async () => {
    let current: StreamState | undefined;
    const loadingStates: boolean[] = [];

    await act(async () => {
      renderer = create(
        createElement(Harness, {
          apiUrl,
          assistantId: 'agent',
          onRender: (stream: StreamState) => {
            current = stream;
            loadingStates.push(stream.isLoading);
          },
        }),
      );
    });

    expect(current).toBeDefined();
    await act(async () => {
      await current?.submit({
        messages: [{ type: 'human', content: 'react' }],
      });
    });

    expect(loadingStates).toContain(true);
    expect(current?.isLoading).toBe(false);
    expect(JSON.stringify(current?.messages)).toContain('echo: react');
    expect(JSON.stringify(current?.values)).toContain('echo: react');
    expect(current?.error).toBeUndefined();
  });

  test('graph 오류를 stock hook error 상태로 투영한다', async () => {
    let current: StreamState | undefined;

    await act(async () => {
      renderer = create(
        createElement(Harness, {
          apiUrl,
          assistantId: 'error',
          onRender: (stream: StreamState) => {
            current = stream;
          },
        }),
      );
    });

    await act(async () => {
      await current
        ?.submit({ messages: [{ type: 'human', content: 'fail' }] })
        .catch(() => undefined);
    });

    expect(current?.isLoading).toBe(false);
    expect(current?.error).toBeTruthy();
  });
});
