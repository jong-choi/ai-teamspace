import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import {
  adaptAgentAuth,
  AgentAuth,
  AgentHttpException,
  AgentRuntimeModule,
  createDurableAgentRuntime,
} from '@repo/agent-runtime';

import { AIMessage } from '@langchain/core/messages';
import {
  interrupt,
  MessagesAnnotation,
  StateGraph,
} from '@langchain/langgraph';

const databaseUrl = process.env.AGENT_TEST_DATABASE_URL;
const redisUrl = process.env.AGENT_TEST_REDIS_URL;
const namespace = process.env.AGENT_PROCESS_TEST_NAMESPACE;

if (!databaseUrl || !redisUrl || !namespace) {
  throw new Error('child process durable test env가 필요합니다.');
}

const approvalGraph = new StateGraph(MessagesAnnotation)
  .addNode('approval', () => {
    const decision = interrupt({ kind: 'process-approval' });
    return {
      messages: [new AIMessage(`process-resumed:${JSON.stringify(decision)}`)],
    };
  })
  .addEdge('__start__', 'approval')
  .addEdge('approval', '__end__')
  .compile();

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

const durable = await createDurableAgentRuntime(
  { approval: approvalGraph },
  {
    postgresUri: databaseUrl,
    redisUri: redisUrl,
    redisPrefix: `work-os:test:process:${namespace}`,
    runQueueName: `work-os-test-process-${namespace}`,
    runConcurrency: 1,
    runTimeoutMs: 10_000,
    overrides: { auth },
  },
);

const runtimeModule = AgentRuntimeModule.forRoot({
  runtime: {
    deps: durable.deps,
    worker: { maxConcurrency: 1, shutdownGraceMs: 500 },
  },
  dispose: () => durable.dispose(),
});

class DurableProcessModule {}
Module({ imports: [runtimeModule] })(DurableProcessModule);

const app = await NestFactory.create(DurableProcessModule, {
  bodyParser: false,
  logger: false,
});
app.enableShutdownHooks();
await app.listen(0, '127.0.0.1');
const address = app.getHttpServer().address();
if (!address || typeof address === 'string') {
  throw new Error('child process listen address를 확인할 수 없습니다.');
}

process.stdout.write(
  `${JSON.stringify({ ready: true, port: address.port })}\n`,
);

let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
