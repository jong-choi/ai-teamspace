import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import type { ProtocolDeps } from '@repo/agent-runtime/agent-protocol';
import type { RunFrame } from '@repo/agent-runtime/core';
import type { ResolvedProtocolRuntime } from '@repo/agent-runtime/server-kit';

import { jest } from '@jest/globals';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { MessagesAnnotation, StateGraph } from '@langchain/langgraph';
import { Client } from '@langchain/langgraph-sdk';
import { Auth as AgentAuth } from '@langchain/langgraph-sdk/auth';
import { Redis } from 'ioredis';

import { adaptAgentAuth } from '#agent-runtime/auth/adapt-agent-auth.js';
import { createDurableAgentRuntime } from '#agent-runtime/durability/create-durable-agent-runtime.js';
import { AgentRuntimeModule } from '#agent-runtime/nest/agent-runtime.module.js';
import { AGENT_RUNTIME } from '#agent-runtime/nest/agent-runtime.tokens.js';

jest.setTimeout(60_000);

const databaseUrl = process.env['DATABASE_URL'];
const redisUrl = process.env['AGENT_TEST_REDIS_URL'];
const integrationDescribe = databaseUrl && redisUrl ? describe : describe.skip;
const redisPrefix = 'work-os:test:agent-runtime';
const runQueueName = 'work-os-test-agent-runtime-runs';

let abortObserved = false;
let slowStarted = false;
let queuedInvocationCount = 0;
let firstQueuedStarted = false;
let releaseFirstQueuedRun: (() => void) | undefined;

function echo(state: typeof MessagesAnnotation.State): {
  messages: BaseMessage[];
} {
  const lastMessage = state.messages.at(-1);
  const text =
    typeof lastMessage?.content === 'string' ? lastMessage.content : '';
  return { messages: [new AIMessage(`echo: ${text}`)] };
}

async function slowEcho(
  state: typeof MessagesAnnotation.State,
  config: RunnableConfig,
): Promise<{ messages: BaseMessage[] }> {
  slowStarted = true;
  await abortableDelay(10_000, config.signal);
  return echo(state);
}

function abortableDelay(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const abort = () => {
      abortObserved = true;
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('run aborted'));
    };

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

const echoGraph = new StateGraph(MessagesAnnotation)
  .addNode('echo', echo)
  .addEdge('__start__', 'echo')
  .addEdge('echo', '__end__')
  .compile();

const slowGraph = new StateGraph(MessagesAnnotation)
  .addNode('slow', slowEcho)
  .addEdge('__start__', 'slow')
  .addEdge('slow', '__end__')
  .compile();

async function queuedEcho(
  state: typeof MessagesAnnotation.State,
): Promise<{ messages: BaseMessage[] }> {
  queuedInvocationCount += 1;
  if (queuedInvocationCount === 1) {
    firstQueuedStarted = true;
    await new Promise<void>((resolve) => {
      releaseFirstQueuedRun = resolve;
    });
  }
  return echo(state);
}

function resetQueuedRunGate(): void {
  queuedInvocationCount = 0;
  firstQueuedStarted = false;
  releaseFirstQueuedRun = undefined;
}

const queuedGraph = new StateGraph(MessagesAnnotation)
  .addNode('queued', queuedEcho)
  .addEdge('__start__', 'queued')
  .addEdge('queued', '__end__')
  .compile();

const replayGraph = new StateGraph(MessagesAnnotation)
  .addNode('first', () => ({ messages: [new AIMessage('replay-step-1')] }))
  .addNode('second', () => ({ messages: [new AIMessage('replay-step-2')] }))
  .addEdge('__start__', 'first')
  .addEdge('first', 'second')
  .addEdge('second', '__end__')
  .compile();

const auth = adaptAgentAuth(
  new AgentAuth()
    .authenticate((request) => {
      const identity = request.headers.get('x-test-user');
      if (!identity) throw new Error('테스트 사용자 header가 필요합니다.');
      return { identity, display_name: identity, permissions: [] };
    })
    .on('threads', ({ user }) => ({ owner_user_id: user.identity }))
    .on('store', ({ user, value }) => {
      value.namespace = [user.identity, ...(value.namespace ?? []).slice(1)];
    }),
);

interface StartedInstance {
  app: INestApplication;
  apiUrl: string;
  runtime: ResolvedProtocolRuntime;
  deps: ProtocolDeps;
  client(userId?: string): Client;
  close(): Promise<void>;
}

async function startInstance(options?: {
  shutdownGraceMs?: number;
  streamTtlSeconds?: number;
}): Promise<StartedInstance> {
  if (!databaseUrl || !redisUrl)
    throw new Error('통합 테스트 infra URL이 필요합니다.');

  const durable = await createDurableAgentRuntime(
    {
      agent: echoGraph,
      replay: replayGraph,
      slow: slowGraph,
      queued: queuedGraph,
    },
    {
      postgresUri: databaseUrl,
      redisUri: redisUrl,
      redisPrefix,
      runQueueName,
      runConcurrency: 2,
      runTimeoutMs: 20_000,
      replay: {
        streamTtlSeconds: options?.streamTtlSeconds ?? 60,
        closedMarkerTtlSeconds: 120,
        closedCheckIntervalMs: 100,
        streamMaxLen: 1_000,
        subscriberBufferFrames: 64,
      },
      overrides: { auth },
    },
  );

  const runtimeModule = AgentRuntimeModule.forRoot({
    runtime: {
      deps: durable.deps,
      worker: {
        maxConcurrency: 2,
        shutdownGraceMs: options?.shutdownGraceMs ?? 1_000,
      },
    },
    dispose: durable.dispose,
  });

  @Module({ imports: [runtimeModule] })
  class DurableIntegrationModule {}

  const app = await NestFactory.create(DurableIntegrationModule, {
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
    runtime: app.get<ResolvedProtocolRuntime>(AGENT_RUNTIME),
    deps: durable.deps,
    client(userId = 'user-a') {
      return new Client({
        apiUrl,
        defaultHeaders: { 'x-test-user': userId },
      });
    },
    close: () => app.close(),
  };
}

async function waitForRunStatus(
  client: Client,
  threadId: string,
  runId: string,
  statuses: string[],
  timeoutMs = 8_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await client.runs.get(threadId, runId);
    if (statuses.includes(run.status)) return run;
    await sleep(50);
  }
  throw new Error(`run ${runId} 상태 대기 시간이 초과되었습니다.`);
}

function collectFrames(iterable: AsyncIterable<RunFrame>): Promise<RunFrame[]> {
  return (async () => {
    const frames: RunFrame[] = [];
    for await (const frame of iterable) frames.push(frame);
    return frames;
  })();
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForCondition(
  condition: () => boolean,
  message: string,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await sleep(20);
  }
  throw new Error(message);
}

interface StartedDurableProcess {
  child: ReturnType<typeof spawn>;
  apiUrl: string;
}

async function startDurableProcess(
  namespace: string,
): Promise<StartedDurableProcess> {
  if (!databaseUrl || !redisUrl)
    throw new Error('child process 통합 테스트 infra URL이 필요합니다.');

  const child = spawn(process.execPath, ['test/fixtures/durable-process.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      AGENT_TEST_REDIS_URL: redisUrl,
      AGENT_PROCESS_TEST_NAMESPACE: namespace,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = child.stdout;
  const stderr = child.stderr;
  if (!stdout || !stderr)
    throw new Error('child process stdio를 열 수 없습니다.');

  return await new Promise<StartedDurableProcess>((resolve, reject) => {
    let output = '';
    let errorOutput = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`child process bootstrap timeout: ${errorOutput}`));
    }, 10_000);

    stderr.on('data', (chunk) => {
      errorOutput += String(chunk);
    });
    stdout.on('data', (chunk) => {
      output += String(chunk);
      const lines = output.split('\n');
      output = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as {
            ready?: boolean;
            port?: number;
          };
          if (message.ready && typeof message.port === 'number') {
            clearTimeout(timeout);
            resolve({ child, apiUrl: `http://127.0.0.1:${message.port}` });
            return;
          }
        } catch {
          // Nest 또는 dependency가 출력한 비-JSON line은 readiness가 아니다.
        }
      }
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `child process가 readiness 전에 종료되었습니다: code=${String(code)} signal=${String(signal)} ${errorOutput}`,
        ),
      );
    });
  });
}

async function stopDurableProcess(
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals = 'SIGTERM',
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill(signal);
  await exited;
}

integrationDescribe('Agent durable runtime 실제 Postgres/Redis 통합', () => {
  beforeAll(async () => {
    await cleanupOwnedRedisKeys();
  });

  afterAll(async () => {
    await cleanupOwnedRedisKeys();
  });

  test('migration을 외부로 분리해도 PostgreSQL readiness 실패를 bootstrap에서 거부한다', async () => {
    if (!redisUrl) throw new Error('Redis URL이 필요합니다.');
    await expect(
      createDurableAgentRuntime(
        { agent: echoGraph },
        {
          postgresUri: 'postgresql://postgres:postgres@127.0.0.1:1/unreachable',
          redisUri: redisUrl,
          redisPrefix: `${redisPrefix}:unreachable`,
          runQueueName: `${runQueueName}-unreachable`,
          runConcurrency: 1,
          migrateOnStartup: false,
          postgres: { connectionTimeoutMs: 100 },
        },
      ),
    ).rejects.toThrow();
  });

  test('두 인스턴스 동시 bootstrap과 Postgres thread execution gate 직렬화를 보장한다', async () => {
    const [instanceA, instanceB] = await Promise.all([
      startInstance(),
      startInstance(),
    ]);

    try {
      const gateA = instanceA.deps.threadExecutionGate;
      const gateB = instanceB.deps.threadExecutionGate;
      expect(gateA).toBeDefined();
      expect(gateB).toBeDefined();

      const held = await gateA!.acquire('shared-thread-gate');
      let secondAcquired = false;
      const secondClaim = gateB!.acquire('shared-thread-gate').then((lease) => {
        secondAcquired = true;
        return lease;
      });

      await sleep(150);
      expect(secondAcquired).toBe(false);
      await held.release();
      const secondLease = await secondClaim;
      expect(secondAcquired).toBe(true);
      await secondLease.release();
    } finally {
      await Promise.allSettled([instanceA.close(), instanceB.close()]);
    }
  });

  test('완료된 thread state와 history가 process restart 뒤에도 유지된다', async () => {
    const first = await startInstance();
    const client = first.client();
    const thread = await client.threads.create();

    const result = await client.runs.wait(thread.thread_id, 'agent', {
      input: { messages: [{ role: 'user', content: 'restart' }] },
    });
    expect(JSON.stringify(result)).toContain('echo: restart');
    await first.close();

    const second = await startInstance();
    try {
      const restarted = second.client();
      const state = await restarted.threads.getState(thread.thread_id);
      const history = await restarted.threads.getHistory(thread.thread_id);
      expect(JSON.stringify(state.values)).toContain('echo: restart');
      expect(JSON.stringify(history)).toContain('echo: restart');
    } finally {
      await second.close();
    }
  });

  test('Redis에 대기 중인 background run이 worker restart 뒤 처리된다', async () => {
    const first = await startInstance();
    const firstClient = first.client();
    await first.runtime.runtime.worker.stop();
    const thread = await firstClient.threads.create();
    const queued = await firstClient.runs.create(thread.thread_id, 'agent', {
      input: { messages: [{ role: 'user', content: 'queued-restart' }] },
    });
    expect(queued.status).toBe('pending');
    await first.close();

    const second = await startInstance();
    try {
      const secondClient = second.client();
      const completed = await waitForRunStatus(
        secondClient,
        thread.thread_id,
        queued.run_id,
        ['success'],
      );
      expect(completed.status).toBe('success');
      const state = await secondClient.threads.getState(thread.thread_id);
      expect(JSON.stringify(state.values)).toContain('echo: queued-restart');
    } finally {
      await second.close();
    }
  });

  test('instance A 실행 frame을 instance B joinStream이 sticky session 없이 수신한다', async () => {
    const [instanceA, instanceB] = await Promise.all([
      startInstance(),
      startInstance(),
    ]);

    try {
      await instanceB.runtime.runtime.worker.stop();
      const clientB = instanceB.client();
      const thread = await clientB.threads.create();
      const run = await clientB.runs.create(thread.thread_id, 'agent', {
        input: { messages: [{ role: 'user', content: 'cross-instance' }] },
        streamMode: 'values',
      });

      const chunks: string[] = [];
      for await (const chunk of clientB.runs.joinStream(
        thread.thread_id,
        run.run_id,
        { streamMode: 'values' },
      )) {
        chunks.push(JSON.stringify(chunk));
      }
      expect(chunks.join('\n')).toContain('echo: cross-instance');
    } finally {
      await Promise.allSettled([instanceA.close(), instanceB.close()]);
    }
  });

  test('stock SDK Last-Event-ID reconnect가 같은 run의 남은 SSE frame을 replay한다', async () => {
    const [instanceA, instanceB] = await Promise.all([
      startInstance(),
      startInstance(),
    ]);

    try {
      await instanceB.runtime.runtime.worker.stop();
      const clientB = instanceB.client();
      const thread = await clientB.threads.create();
      const run = await clientB.runs.create(thread.thread_id, 'replay', {
        input: { messages: [{ role: 'user', content: 'resume' }] },
        streamMode: 'values',
      });

      let lastEventId: string | undefined;
      for await (const chunk of clientB.runs.joinStream(
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

      const resumed: string[] = [];
      for await (const chunk of clientB.runs.joinStream(
        thread.thread_id,
        run.run_id,
        { lastEventId, streamMode: 'values' },
      )) {
        resumed.push(JSON.stringify(chunk));
      }
      expect(resumed.join('\n')).toContain('replay-step-2');
    } finally {
      await Promise.allSettled([instanceA.close(), instanceB.close()]);
    }
  });

  test('instance B cancel이 instance A에서 실행 중인 graph AbortSignal까지 전달된다', async () => {
    abortObserved = false;
    slowStarted = false;
    const [instanceA, instanceB] = await Promise.all([
      startInstance(),
      startInstance(),
    ]);

    try {
      await instanceB.runtime.runtime.worker.stop();
      const clientB = instanceB.client();
      const thread = await clientB.threads.create();
      const run = await clientB.runs.create(thread.thread_id, 'slow', {
        input: { messages: [{ role: 'user', content: 'cancel-me' }] },
      });

      await waitForRunStatus(clientB, thread.thread_id, run.run_id, [
        'running',
      ]);
      await waitForCondition(
        () => slowStarted,
        'slow graph node가 실행을 시작하지 않았습니다.',
      );
      await clientB.runs.cancel(thread.thread_id, run.run_id, true);
      const cancelled = await waitForRunStatus(
        clientB,
        thread.thread_id,
        run.run_id,
        ['cancelled'],
      );
      expect(cancelled.status).toBe('cancelled');
      await waitForCondition(
        () => abortObserved,
        'cross-instance cancel AbortSignal이 graph까지 전달되지 않았습니다.',
      );
    } finally {
      await Promise.allSettled([instanceA.close(), instanceB.close()]);
    }
  });

  test('Nest shutdown grace가 지난 active run을 abort하고 재시작 뒤 cancelled 상태를 보존한다', async () => {
    abortObserved = false;
    slowStarted = false;
    const first = await startInstance({ shutdownGraceMs: 50 });
    const client = first.client();
    const thread = await client.threads.create();
    const run = await client.runs.create(thread.thread_id, 'slow', {
      input: { messages: [{ role: 'user', content: 'shutdown' }] },
    });
    await waitForRunStatus(client, thread.thread_id, run.run_id, ['running']);
    await waitForCondition(
      () => slowStarted,
      'shutdown 대상 slow graph node가 실행을 시작하지 않았습니다.',
    );

    await first.close();
    expect(abortObserved).toBe(true);

    const restarted = await startInstance();
    try {
      const persisted = await restarted
        .client()
        .runs.get(thread.thread_id, run.run_id);
      expect(persisted.status).toBe('cancelled');
    } finally {
      await restarted.close();
    }
  });

  test('Redis Stream replay가 seq 이후 frame만 재생하고 close marker로 종료된다', async () => {
    const [instanceA, instanceB] = await Promise.all([
      startInstance(),
      startInstance(),
    ]);

    try {
      const runId = `replay-${randomUUID()}`;
      await instanceA.deps.bus.publish(runId, {
        seq: 1,
        event: 'values',
        data: { value: 1 },
      });
      await instanceA.deps.bus.publish(runId, {
        seq: 2,
        event: 'values',
        data: { value: 2 },
      });
      await instanceA.deps.bus.close(runId);

      const frames = await collectFrames(
        instanceB.deps.bus.subscribe(runId, 1),
      );
      expect(frames.map((frame) => frame.seq)).toEqual([2]);
    } finally {
      await Promise.allSettled([instanceA.close(), instanceB.close()]);
    }
  });

  test('frame stream TTL이 지나도 closed marker가 settled join의 무한 대기를 막는다', async () => {
    const [instanceA, instanceB] = await Promise.all([
      startInstance({ streamTtlSeconds: 1 }),
      startInstance({ streamTtlSeconds: 1 }),
    ]);

    try {
      const runId = `expired-replay-${randomUUID()}`;
      await instanceA.deps.bus.publish(runId, {
        seq: 1,
        event: 'values',
        data: { value: 1 },
      });
      await instanceA.deps.bus.close(runId);
      await sleep(1_250);

      const frames = await Promise.race([
        collectFrames(instanceB.deps.bus.subscribe(runId)),
        sleep(1_000).then(() => {
          throw new Error('closed marker 확인이 지연되었습니다.');
        }),
      ]);
      expect(frames).toEqual([]);
    } finally {
      await Promise.allSettled([instanceA.close(), instanceB.close()]);
    }
  });

  test('Postgres ownership filter와 Redis namespace가 instance 간에도 격리된다', async () => {
    const instance = await startInstance();
    try {
      const userA = instance.client('user-a');
      const userB = instance.client('user-b');
      const thread = await userA.threads.create();
      await expect(userB.threads.get(thread.thread_id)).rejects.toThrow(
        'HTTP 404',
      );

      await userA.store.putItem(['memory', 'notes'], 'private', { value: 'a' });
      await expect(
        userB.store.getItem(['memory', 'notes'], 'private'),
      ).rejects.toThrow('HTTP 404');

      if (!redisUrl) throw new Error('Redis URL이 필요합니다.');
      const redis = new Redis(redisUrl);
      try {
        const keys = await redis.keys('*');
        expect(keys.some((key) => key.startsWith(`${redisPrefix}:`))).toBe(
          true,
        );
        expect(
          keys.some((key) => key.startsWith(`bull:${runQueueName}:`)),
        ).toBe(true);
        expect(keys.some((key) => key.startsWith('skein:'))).toBe(false);
        expect(keys.some((key) => key.startsWith('bull:skein-runs:'))).toBe(
          false,
        );
      } finally {
        await redis.quit();
      }
    } finally {
      await instance.close();
    }
  });

  test('실제 child process SIGKILL 뒤 새 process가 persisted interrupt를 새 run으로 resume한다', async () => {
    const namespace = `child-${randomUUID()}`;
    const first = await startDurableProcess(namespace);
    let firstStopped = false;
    try {
      const firstClient = new Client({
        apiUrl: first.apiUrl,
        defaultHeaders: { 'x-test-user': 'user-a' },
      });
      const thread = await firstClient.threads.create();
      const interrupted = await firstClient.runs.create(
        thread.thread_id,
        'approval',
        {
          input: { messages: [{ role: 'user', content: 'process restart' }] },
        },
      );
      await waitForRunStatus(
        firstClient,
        thread.thread_id,
        interrupted.run_id,
        ['interrupted'],
      );
      const beforeKill = await firstClient.threads.getState(thread.thread_id);
      expect(JSON.stringify(beforeKill)).toContain('process-approval');

      await stopDurableProcess(first.child, 'SIGKILL');
      firstStopped = true;

      const restarted = await startDurableProcess(namespace);
      try {
        const client = new Client({
          apiUrl: restarted.apiUrl,
          defaultHeaders: { 'x-test-user': 'user-a' },
        });
        const persisted = await client.threads.getState(thread.thread_id);
        expect(JSON.stringify(persisted)).toContain('process-approval');

        const resumed = await client.runs.create(thread.thread_id, 'approval', {
          command: { resume: { approved: true } },
        });
        expect(resumed.run_id).not.toBe(interrupted.run_id);
        await waitForRunStatus(client, thread.thread_id, resumed.run_id, [
          'success',
        ]);
        const finalState = await client.threads.getState(thread.thread_id);
        const serialized = JSON.stringify(finalState.values);
        expect(serialized).toContain('process-resumed');
        expect(serialized).toContain('approved');
        expect(JSON.stringify(finalState.tasks)).not.toContain(
          'process-approval',
        );
      } finally {
        await stopDurableProcess(restarted.child);
      }
    } finally {
      if (!firstStopped) await stopDurableProcess(first.child, 'SIGKILL');
    }
  });

  test('multitask reject는 active run을 보존하고 enqueue는 같은 thread에서 순서대로 실행한다', async () => {
    resetQueuedRunGate();
    const instance = await startInstance();

    try {
      const client = instance.client();
      const thread = await client.threads.create();
      const first = await client.runs.create(thread.thread_id, 'queued', {
        input: { messages: [{ role: 'user', content: 'first queued' }] },
      });
      await waitForCondition(
        () => firstQueuedStarted,
        '첫 queued run이 graph node에 진입하지 않았습니다.',
      );

      await expect(
        client.runs.create(thread.thread_id, 'queued', {
          input: { messages: [{ role: 'user', content: 'must reject' }] },
          multitaskStrategy: 'reject',
        }),
      ).rejects.toThrow('HTTP 422');
      expect(
        (await client.runs.get(thread.thread_id, first.run_id)).status,
      ).toBe('running');

      const enqueued = await client.runs.create(thread.thread_id, 'queued', {
        input: { messages: [{ role: 'user', content: 'second queued' }] },
        multitaskStrategy: 'enqueue',
      });
      expect(enqueued.run_id).not.toBe(first.run_id);
      releaseFirstQueuedRun?.();
      releaseFirstQueuedRun = undefined;

      await waitForRunStatus(client, thread.thread_id, first.run_id, [
        'success',
      ]);
      await waitForRunStatus(client, thread.thread_id, enqueued.run_id, [
        'success',
      ]);

      const state = await client.threads.getState(thread.thread_id);
      const serialized = JSON.stringify(state.values);
      expect(serialized).toContain('echo: first queued');
      expect(serialized).toContain('echo: second queued');
    } finally {
      releaseFirstQueuedRun?.();
      releaseFirstQueuedRun = undefined;
      await instance.close();
    }
  });

  test('동일 Idempotency-Key 재시도는 다른 instance에서도 같은 run을 재사용한다', async () => {
    const [instanceA, instanceB] = await Promise.all([
      startInstance(),
      startInstance(),
    ]);

    try {
      await instanceB.runtime.runtime.worker.stop();
      const clientA = instanceA.client();
      const thread = await clientA.threads.create();
      const body = {
        assistant_id: 'agent',
        input: { messages: [{ role: 'user', content: 'idempotent' }] },
      };
      const idempotencyKey = `run-${randomUUID()}`;
      const headers = {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
        'x-test-user': 'user-a',
      };

      const firstResponse = await fetch(
        `${instanceA.apiUrl}/threads/${thread.thread_id}/runs`,
        { method: 'POST', headers, body: JSON.stringify(body) },
      );
      expect(firstResponse.status).toBe(200);
      const firstRun = (await firstResponse.json()) as { run_id: string };

      const replayResponse = await fetch(
        `${instanceB.apiUrl}/threads/${thread.thread_id}/runs`,
        { method: 'POST', headers, body: JSON.stringify(body) },
      );
      expect(replayResponse.status).toBe(200);
      const replayedRun = (await replayResponse.json()) as { run_id: string };
      expect(replayedRun.run_id).toBe(firstRun.run_id);

      const runs = await clientA.runs.list(thread.thread_id, { limit: 10 });
      expect(runs.filter((run) => run.run_id === firstRun.run_id)).toHaveLength(
        1,
      );

      const concurrentThread = await clientA.threads.create();
      const concurrentHeaders = {
        ...headers,
        'idempotency-key': `concurrent-${randomUUID()}`,
      };
      const concurrentBody = JSON.stringify({
        assistant_id: 'agent',
        input: { messages: [{ role: 'user', content: 'concurrent' }] },
      });
      const concurrentResponses = await Promise.all([
        fetch(
          `${instanceA.apiUrl}/threads/${concurrentThread.thread_id}/runs`,
          {
            method: 'POST',
            headers: concurrentHeaders,
            body: concurrentBody,
          },
        ),
        fetch(
          `${instanceB.apiUrl}/threads/${concurrentThread.thread_id}/runs`,
          {
            method: 'POST',
            headers: concurrentHeaders,
            body: concurrentBody,
          },
        ),
      ]);
      const concurrentStatuses = concurrentResponses.map(
        (response) => response.status,
      );
      expect(concurrentStatuses).toContain(200);
      expect(
        concurrentStatuses.every((status) => status === 200 || status === 409),
      ).toBe(true);
      const afterConcurrent = await clientA.runs.list(
        concurrentThread.thread_id,
        { limit: 10 },
      );
      expect(afterConcurrent).toHaveLength(1);

      const conflict = await fetch(
        `${instanceB.apiUrl}/threads/${thread.thread_id}/runs`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...body,
            input: { messages: [{ role: 'user', content: 'different' }] },
          }),
        },
      );
      expect(conflict.status).toBe(422);
    } finally {
      await Promise.allSettled([instanceA.close(), instanceB.close()]);
    }
  });
});

async function cleanupOwnedRedisKeys(): Promise<void> {
  if (!redisUrl) return;
  const redis = new Redis(redisUrl);
  try {
    // 공유 Redis의 다른 key를 지우지 않도록 이 suite와 durable-process fixture의 namespace만 정리한다.
    for (const pattern of [
      `${redisPrefix}:*`,
      `bull:${runQueueName}*`,
      'work-os:test:process:*',
      'bull:work-os-test-process-*',
    ]) {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          200,
        );
        cursor = nextCursor;
        if (keys.length > 0) await redis.unlink(...keys);
      } while (cursor !== '0');
    }
  } finally {
    await redis.quit();
  }
}
