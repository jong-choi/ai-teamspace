import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import {
  embedInMemoryGraphs,
  type ResolvedProtocolRuntime,
} from '@repo/agent-runtime/server-kit';

import { jest } from '@jest/globals';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { MessagesAnnotation, StateGraph } from '@langchain/langgraph';

import { AgentRuntimeModule } from '#agent-runtime/nest/agent-runtime.module.js';
import { AGENT_RUNTIME } from '#agent-runtime/nest/agent-runtime.tokens.js';

function echo(state: typeof MessagesAnnotation.State): {
  messages: BaseMessage[];
} {
  const lastMessage = state.messages.at(-1);
  const text =
    typeof lastMessage?.content === 'string' ? lastMessage.content : '';
  return { messages: [new AIMessage(`echo: ${text}`)] };
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode('echo', echo)
  .addEdge('__start__', 'echo')
  .addEdge('echo', '__end__')
  .compile();

const dispose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const deps = embedInMemoryGraphs({ agent: graph });

@Module({
  imports: [
    AgentRuntimeModule.forRoot({
      runtime: { deps },
      dispose,
    }),
  ],
})
class LifecycleTestModule {}

describe('Agent runtime Nest 생명주기', () => {
  beforeEach(() => {
    dispose.mockClear();
  });

  test('주요 Agent Protocol route를 같은 Nest application에 mount한다', async () => {
    const app = await NestFactory.create(LifecycleTestModule, {
      logger: false,
    });

    try {
      const resolved = app.get<ResolvedProtocolRuntime>(AGENT_RUNTIME);
      const routes = resolved.routes.map(
        ({ method, path }) => `${method.toUpperCase()} ${path}`,
      );

      expect(routes).toEqual(
        expect.arrayContaining([
          'POST /assistants/search',
          'POST /threads',
          'GET /threads/:thread_id/state',
          'POST /threads/:thread_id/history',
          'POST /threads/:thread_id/runs/stream',
          'GET /threads/:thread_id/runs/:run_id/stream',
          'POST /threads/:thread_id/runs/:run_id/cancel',
          'PUT /store/items',
        ]),
      );
    } finally {
      await app.close();
    }
  });

  test('runtime resolve가 실패하면 bootstrap 중 생성한 resource를 즉시 dispose한다', async () => {
    const failedDispose = jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);

    @Module({
      imports: [
        AgentRuntimeModule.forRoot({
          runtime: { config: './존재하지-않는-langgraph.json' },
          dispose: failedDispose,
        }),
      ],
    })
    class FailingRuntimeModule {}

    await expect(
      NestFactory.create(FailingRuntimeModule, {
        abortOnError: false,
        logger: false,
      }),
    ).rejects.toThrow();
    expect(failedDispose).toHaveBeenCalledTimes(1);
  });

  test('Nest shutdown에서 worker 종료 후 소유 resource dispose를 호출한다', async () => {
    const app = await NestFactory.create(LifecycleTestModule, {
      logger: false,
    });
    app.enableShutdownHooks();

    await app.close();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test('worker stop이 실패해도 소유 resource를 dispose하고 오류를 기록한다', async () => {
    const failedShutdownDispose = jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);

    @Module({
      imports: [
        AgentRuntimeModule.forRoot({
          runtime: { deps },
          dispose: failedShutdownDispose,
        }),
      ],
    })
    class WorkerStopFailureModule {}

    const app = await NestFactory.create(WorkerStopFailureModule, {
      logger: false,
    });
    const resolved = app.get<ResolvedProtocolRuntime>(AGENT_RUNTIME);
    const errorSpy = jest
      .spyOn(resolved.logger!, 'error')
      .mockImplementation(() => {});
    jest
      .spyOn(resolved.runtime.worker, 'stop')
      .mockRejectedValueOnce(new Error('worker stop failure'));

    await expect(app.close()).resolves.toBeUndefined();
    expect(failedShutdownDispose).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Agent runtime worker stop failed during shutdown.',
      expect.objectContaining({ message: 'worker stop failure' }),
    );
  });
});
