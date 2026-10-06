import type {
  ProtocolDeps,
  WebhookDeliveryConfig,
} from '@repo/agent-runtime/agent-protocol';
import {
  RedisDeliveryQueue,
  RedisRunAbortChannel,
  RedisRunEventBus,
  type RedisRunEventBusOptions,
  RedisRunQueue,
} from '@repo/agent-runtime/redis';
import {
  CHECKPOINTER_MIGRATIONS_LOCK,
  createPostgresPool,
  createPostgresThreadExecutionGate,
  PostgresSkeinStore,
  type PostgresSkeinStoreOptions,
  type StoreIndexConfig,
  withSessionAdvisoryLock,
} from '@repo/agent-runtime/storage-postgres';

import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Redis } from 'ioredis';

export type Disposer = () => Promise<unknown>;
export type StoreTtl = NonNullable<PostgresSkeinStoreOptions['ttl']>;
export type ThreadTtl = NonNullable<PostgresSkeinStoreOptions['threadTtl']>;

export interface PostgresConnectionOptions {
  poolMax?: number;
  sslNoVerify?: boolean;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
  statementTimeoutMs?: number;
}

export interface RedisDriverOptions {
  keyPrefix: string;
  runQueueName: string;
  deliveryQueueName: string;
  eventBus?: Omit<RedisRunEventBusOptions, 'keyPrefix' | 'createClient'>;
  webhooks?: WebhookDeliveryConfig;
}

/** 생성 역순으로 resource를 닫아 worker 의존 resource가 DB pool보다 먼저 종료되게 한다. */
export async function runDisposers(disposers: Disposer[]): Promise<void> {
  for (const dispose of [...disposers].reverse()) {
    try {
      await dispose();
    } catch {
      // 하나의 close 실패가 나머지 connection 정리를 막지 않게 한다.
    }
  }
}

/** HTTP readiness 전에 Redis가 실제 command를 받을 수 있는지 확인한다. */
export async function verifyRedisReady(url: string): Promise<void> {
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 5_000,
    maxRetriesPerRequest: 1,
  });

  try {
    await client.connect();
    await client.ping();
  } finally {
    if (client.status === 'ready') {
      await client.quit().catch(() => client.disconnect());
    } else {
      client.disconnect();
    }
  }
}

/** HTTP readiness 전에 PostgreSQL이 실제 query를 받을 수 있는지 확인한다. */
async function verifyPostgresReady(
  url: string,
  connectionOptions: PostgresConnectionOptions,
): Promise<void> {
  const pool = createPostgresPool(url, {
    ...connectionOptions,
    poolMax: 1,
  });
  try {
    await pool.query('SELECT 1');
  } finally {
    await pool.end();
  }
}

/** Postgres protocol store, PostgresSaver, cross-instance thread gate를 한 ownership으로 조립한다. */
export async function connectPostgresStore(args: {
  url: string;
  index?: StoreIndexConfig;
  ttl?: StoreTtl;
  threadTtl?: ThreadTtl;
  connectionOptions: PostgresConnectionOptions;
  maxPageSize: number;
  runConcurrency: number;
  migrateOnStartup: boolean;
  disposers: Disposer[];
}): Promise<
  Pick<ProtocolDeps, 'store' | 'checkpointer' | 'threadExecutionGate'>
> {
  const {
    url,
    index,
    ttl,
    threadTtl,
    connectionOptions,
    maxPageSize,
    runConcurrency,
    migrateOnStartup,
    disposers,
  } = args;

  await verifyPostgresReady(url, connectionOptions);

  const store = await PostgresSkeinStore.connect(url, {
    ...(index ? { index } : {}),
    ...(ttl ? { ttl } : {}),
    ...(threadTtl ? { threadTtl } : {}),
    ...connectionOptions,
    maxPageSize,
  });
  disposers.push(() => store.close());

  if (migrateOnStartup) {
    await store.migrate();

    // PostgresSaver.setup()은 자체 동시 실행 보호가 없으므로 rolling boot끼리 advisory lock을 공유한다.
    const setupPool = createPostgresPool(url, {
      ...connectionOptions,
      statementTimeoutMs: 0,
      poolMax: 2,
    });
    try {
      await withSessionAdvisoryLock(
        setupPool,
        {
          key: CHECKPOINTER_MIGRATIONS_LOCK,
          lockName: 'agent checkpointer migration',
        },
        () => new PostgresSaver(setupPool).setup(),
      );
    } finally {
      await setupPool.end();
    }
  }

  const checkpointer = new PostgresSaver(
    createPostgresPool(url, connectionOptions),
  );
  disposers.push(() => checkpointer.end());

  // 실행 중인 run 하나가 gate connection 하나를 잡으므로 store pool과 분리한다.
  const gatePool = createPostgresPool(url, {
    ...connectionOptions,
    poolMax: threadGatePoolMax(connectionOptions.poolMax, runConcurrency),
  });
  disposers.push(() => gatePool.end());

  return {
    store,
    checkpointer,
    threadExecutionGate: createPostgresThreadExecutionGate(gatePool, {
      warn: (message, meta) =>
        console.warn(`agent runtime: ${message}`, meta ?? ''),
    }),
  };
}

/** Redis durable queue/replay/live fan-out/cross-instance abort를 같은 namespace 정책으로 조립한다. */
export async function connectRedisRuntime(args: {
  url: string;
  options: RedisDriverOptions;
  disposers: Disposer[];
}): Promise<
  Pick<ProtocolDeps, 'queue' | 'bus' | 'abortChannel' | 'deliveryQueue'>
> {
  const { url, options, disposers } = args;
  await verifyRedisReady(url);

  const queue = new RedisRunQueue(url, {
    queueName: options.runQueueName,
  });
  disposers.push(() => queue.dispose());

  const deliveryQueue = new RedisDeliveryQueue(url, {
    queueName: options.deliveryQueueName,
    ...(options.webhooks?.retries?.initialDelayMs !== undefined
      ? { initialDelayMs: options.webhooks.retries.initialDelayMs }
      : {}),
  });
  disposers.push(() => deliveryQueue.dispose());

  const bus = new RedisRunEventBus(url, {
    keyPrefix: options.keyPrefix,
    ...options.eventBus,
  });
  disposers.push(() => bus.dispose());

  const abortChannel = new RedisRunAbortChannel(url, {
    keyPrefix: options.keyPrefix,
    onError: (error) =>
      console.warn('agent runtime: Redis abort channel 오류', error),
  });
  disposers.push(() => abortChannel.dispose());

  return { queue, bus, abortChannel, deliveryQueue };
}

const INLINE_RUN_HEADROOM = 4;

function threadGatePoolMax(
  configuredPoolMax: number | undefined,
  runConcurrency: number,
): number {
  return Math.max(
    configuredPoolMax ?? 10,
    runConcurrency + INLINE_RUN_HEADROOM,
  );
}
