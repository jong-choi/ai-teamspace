import { jest } from '@jest/globals';
import { MessagesAnnotation, StateGraph } from '@langchain/langgraph';

import { createDurableAgentRuntime } from '#agent-runtime/durability/create-durable-agent-runtime.js';
import { runDisposers } from '#agent-runtime/durability/drivers.js';

const graph = new StateGraph(MessagesAnnotation)
  .addNode('noop', () => ({ messages: [] }))
  .addEdge('__start__', 'noop')
  .addEdge('noop', '__end__')
  .compile();

const validOptions = {
  postgresUri: 'postgresql://localhost/agent',
  redisUri: 'redis://localhost:6379',
  redisPrefix: 'work-os:test:agent',
  runQueueName: 'work-os-test-agent-runs',
  runConcurrency: 2,
} as const;

describe('Agent durable runtime 설정', () => {
  test('빈 connection과 namespace를 infra 연결 전에 거부한다', async () => {
    await expect(
      createDurableAgentRuntime(
        { agent: graph },
        { ...validOptions, redisPrefix: ' ' },
      ),
    ).rejects.toThrow('redisPrefix');
  });

  test('BullMQ queue 이름의 콜론을 거부한다', async () => {
    await expect(
      createDurableAgentRuntime(
        { agent: graph },
        { ...validOptions, runQueueName: 'work-os:agent:runs' },
      ),
    ).rejects.toThrow('콜론');
  });

  test('Postgres pool 크기는 1 이상이어야 한다', async () => {
    await expect(
      createDurableAgentRuntime(
        { agent: graph },
        { ...validOptions, postgres: { poolMax: 0 } },
      ),
    ).rejects.toThrow('postgres.poolMax');
  });

  test('resource disposer를 생성 역순으로 실행하고 개별 실패를 격리한다', async () => {
    const order: string[] = [];
    const failure = jest.fn(async () => {
      order.push('redis');
      throw new Error('의도한 close 실패');
    });

    await expect(
      runDisposers([
        async () => {
          order.push('postgres');
        },
        failure,
        async () => {
          order.push('worker-adjacent');
        },
      ]),
    ).resolves.toBeUndefined();

    expect(order).toEqual(['worker-adjacent', 'redis', 'postgres']);
    expect(failure).toHaveBeenCalledTimes(1);
  });
});
