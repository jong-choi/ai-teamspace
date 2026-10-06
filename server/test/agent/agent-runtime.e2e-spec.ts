import type { AddressInfo } from 'node:net';

import {
  Controller,
  Get,
  type INestApplication,
  Module,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE, NestFactory } from '@nestjs/core';

import {
  adaptAgentAuth,
  AgentAuth,
  AgentHttpException,
  AgentRuntimeModule,
  createInMemoryAgentRuntimeDeps,
} from '@repo/agent-runtime';
import { ProblemDetailsFilter } from '#server/common/http/problem-details.filter.js';

import { Client } from '@langchain/langgraph-sdk';
import { NestProblemDetailsModule } from 'nest-problem-details-filter';

import { deterministicAgentGraph } from '#server-test/agent/fixtures/deterministic-agent.fixture.js';

const auth = adaptAgentAuth(
  new AgentAuth()
    .authenticate((request) => {
      const identity = request.headers.get('x-test-user');
      if (!identity) {
        throw new AgentHttpException(401, { message: '인증이 필요합니다.' });
      }
      return { identity, display_name: identity, permissions: [] };
    })
    .on('threads', ({ user }) => ({ owner_user_id: user.identity }))
    .on('store', ({ user, value }) => {
      value.namespace = [user.identity, ...(value.namespace ?? []).slice(1)];
    }),
);

const deps = createInMemoryAgentRuntimeDeps(
  { agent: deterministicAgentGraph },
  { auth },
);

@Controller('probe')
class ProbeController {
  @Get()
  getProbe() {
    return { ok: true };
  }
}

@Module({
  imports: [
    NestProblemDetailsModule.register({
      strictRfcDefaults: true,
      suppressDetail: ({ status }) => status >= 500,
    }),
    AgentRuntimeModule.forRoot({ runtime: { deps } }),
  ],
  controllers: [ProbeController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
    {
      provide: APP_PIPE,
      useClass: StandardSchemaValidationPipe,
    },
  ],
})
class AgentRuntimeTestModule {}

function createClient(apiUrl: string, userId: string) {
  return new Client({
    apiUrl,
    defaultHeaders: { 'x-test-user': userId },
  });
}

describe('Agent runtime SDK 호환성', () => {
  let app: INestApplication;
  let apiUrl: string;
  let userA: Client;
  let userB: Client;

  beforeAll(async () => {
    app = await NestFactory.create(AgentRuntimeTestModule, {
      bodyParser: false,
      logger: false,
    });
    app.enableShutdownHooks();
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    apiUrl = `http://127.0.0.1:${address.port}`;
    userA = createClient(apiUrl, 'user-a');
    userB = createClient(apiUrl, 'user-b');
  });

  afterAll(async () => {
    await app.close();
  });

  test('Agent route가 아닌 요청은 기존 Nest controller로 통과한다', async () => {
    const response = await fetch(`${apiUrl}/probe`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  test('인증 없는 Agent Protocol 요청을 거부한다', async () => {
    const response = await fetch(`${apiUrl}/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);
  });

  test('bodyParser 비활성 상태에서 잘못된 JSON을 400으로 처리하고 서버는 계속 동작한다', async () => {
    const response = await fetch(`${apiUrl}/threads`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'user-a',
      },
      body: '{',
    });
    expect(response.status).toBe(400);

    const probe = await fetch(`${apiUrl}/probe`);
    expect(probe.status).toBe(200);
  });

  test('stock SDK로 assistant와 thread를 조회하고 사용자 ownership을 격리한다', async () => {
    const assistants = await userA.assistants.search({ graphId: 'agent' });
    expect(assistants.some((assistant) => assistant.graph_id === 'agent')).toBe(
      true,
    );

    const assistant = await userA.assistants.get('agent');
    expect(assistant.graph_id).toBe('agent');

    const thread = await userA.threads.create();
    const loaded = await userA.threads.get(thread.thread_id);
    expect(loaded.thread_id).toBe(thread.thread_id);
    expect(loaded.metadata?.owner_user_id).toBe('user-a');

    await expect(userB.threads.get(thread.thread_id)).rejects.toThrow();

    await userA.store.putItem(['memory', 'notes'], 'private-note', {
      text: 'user-a only',
    });
    const ownItem = await userA.store.getItem(
      ['memory', 'notes'],
      'private-note',
    );
    expect(ownItem?.value).toEqual({ text: 'user-a only' });
    await expect(
      userB.store.getItem(['memory', 'notes'], 'private-note'),
    ).rejects.toThrow('HTTP 404');
  });

  test('stock SDK runs.wait, runs.stream, state, history를 실제 HTTP로 처리한다', async () => {
    const waitThread = await userA.threads.create();
    const waited = await userA.runs.wait(waitThread.thread_id, 'agent', {
      input: { messages: [{ role: 'user', content: 'wait' }] },
    });
    expect(JSON.stringify(waited)).toContain('echo: wait');

    const streamThread = await userA.threads.create();
    const chunks: string[] = [];
    for await (const chunk of userA.runs.stream(
      streamThread.thread_id,
      'agent',
      {
        input: { messages: [{ role: 'user', content: 'stream' }] },
        streamMode: 'values',
      },
    )) {
      chunks.push(JSON.stringify(chunk));
    }
    expect(chunks.join('\n')).toContain('echo: stream');

    const state = await userA.threads.getState(streamThread.thread_id);
    expect(JSON.stringify(state.values)).toContain('echo: stream');

    const history = await userA.threads.getHistory(streamThread.thread_id, {
      limit: 10,
    });
    expect(history.length).toBeGreaterThan(0);
  });

  test('stock SDK runs.joinStream으로 background run의 SSE를 재결합한다', async () => {
    const thread = await userA.threads.create();
    const run = await userA.runs.create(thread.thread_id, 'agent', {
      input: { messages: [{ role: 'user', content: 'join' }] },
      streamMode: 'values',
    });

    const chunks: string[] = [];
    for await (const chunk of userA.runs.joinStream(
      thread.thread_id,
      run.run_id,
      {
        streamMode: 'values',
      },
    )) {
      chunks.push(JSON.stringify(chunk));
    }
    expect(chunks.join('\n')).toContain('echo: join');
  });

  test('stock SDK cancel 경로가 pending background run을 cancelled로 정리한다', async () => {
    const thread = await userA.threads.create();
    const run = await userA.runs.create(thread.thread_id, 'agent', {
      input: { messages: [{ role: 'user', content: 'cancel' }] },
      afterSeconds: 2,
    });

    await userA.runs.cancel(thread.thread_id, run.run_id, true);
    const cancelled = await userA.runs.get(thread.thread_id, run.run_id);
    expect(cancelled.status).toBe('cancelled');
  });
});
