import type { ProtocolDeps } from '@repo/agent-runtime/agent-protocol';
import type { GraphResolver } from '@repo/agent-runtime/agent-protocol';
import {
  cloneLangGraphCheckpoint,
  SkeinBaseStore,
} from '@repo/agent-runtime/langgraph';
import {
  type EmbeddableGraph,
  normalizeEmbeddableGraphs,
} from '@repo/agent-runtime/server-kit';

import { MemorySaver } from '@langchain/langgraph';

import {
  connectPostgresStore,
  connectRedisRuntime,
  type Disposer,
  type PostgresConnectionOptions,
  runDisposers,
} from '#agent-runtime/durability/drivers.js';
import { RuntimeConfigError } from '#agent-runtime/durability/errors.js';

const DEFAULT_CONNECTION_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_PAGE_SIZE = 1_000;

export interface DurableAgentRuntimeOptions {
  postgresUri: string;
  redisUri: string;
  redisPrefix: string;
  runQueueName: string;
  runConcurrency: number;
  runTimeoutMs?: number;
  migrateOnStartup?: boolean;
  postgres?: Omit<PostgresConnectionOptions, 'statementTimeoutMs'>;
  replay?: {
    streamTtlSeconds?: number;
    closedMarkerTtlSeconds?: number;
    closedCheckIntervalMs?: number;
    streamMaxLen?: number;
    subscriberBufferFrames?: number;
  };
  overrides?: Omit<
    Partial<ProtocolDeps>,
    | 'graphs'
    | 'store'
    | 'queue'
    | 'bus'
    | 'checkpointer'
    | 'abortChannel'
    | 'threadExecutionGate'
    | 'deliveryQueue'
    | 'runTimeoutMs'
  >;
}

export interface DurableAgentRuntime {
  deps: ProtocolDeps;
  dispose(): Promise<void>;
}

/** Postgres/Redis production driver를 Agent Protocol deps로 조립한다. */
export async function createDurableAgentRuntime(
  graphs: GraphResolver | Record<string, EmbeddableGraph>,
  options: DurableAgentRuntimeOptions,
): Promise<DurableAgentRuntime> {
  validateOptions(options);

  const disposers: Disposer[] = [];
  let disposal: Promise<void> | undefined;
  const dispose = (): Promise<void> => {
    disposal ??= runDisposers(disposers);
    return disposal;
  };

  try {
    const postgres = await connectPostgresStore({
      url: options.postgresUri,
      connectionOptions: {
        connectionTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_MS,
        ...options.postgres,
      },
      maxPageSize: DEFAULT_MAX_PAGE_SIZE,
      runConcurrency: options.runConcurrency,
      migrateOnStartup: options.migrateOnStartup ?? true,
      disposers,
    });

    const redis = await connectRedisRuntime({
      url: options.redisUri,
      options: {
        keyPrefix: options.redisPrefix,
        runQueueName: options.runQueueName,
        deliveryQueueName: `${options.runQueueName}-deliveries`,
        eventBus: options.replay,
      },
      disposers,
    });

    const deps: ProtocolDeps = {
      ...postgres,
      ...redis,
      graphs: normalizeEmbeddableGraphs(graphs),
      storeBridge: (repo) => new SkeinBaseStore(repo),
      ephemeralCheckpointer: () => new MemorySaver(),
      cloneCheckpoint: cloneLangGraphCheckpoint,
      ...(options.runTimeoutMs !== undefined
        ? { runTimeoutMs: options.runTimeoutMs }
        : {}),
      ...options.overrides,
    };

    return { deps, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

function validateOptions(options: DurableAgentRuntimeOptions): void {
  requireNonBlank('postgresUri', options.postgresUri);
  requireNonBlank('redisUri', options.redisUri);
  requireNonBlank('redisPrefix', options.redisPrefix);
  requireNonBlank('runQueueName', options.runQueueName);

  if (options.runQueueName.includes(':')) {
    throw new RuntimeConfigError(
      'runQueueName에는 콜론(:)을 사용할 수 없습니다.',
    );
  }

  requirePositiveInteger('runConcurrency', options.runConcurrency);

  if (options.runTimeoutMs !== undefined) {
    requirePositiveInteger('runTimeoutMs', options.runTimeoutMs);
  }

  for (const [name, value] of Object.entries(options.replay ?? {})) {
    if (value !== undefined) requirePositiveInteger(`replay.${name}`, value);
  }

  if (options.postgres?.poolMax !== undefined) {
    requirePositiveInteger('postgres.poolMax', options.postgres.poolMax);
  }

  for (const [name, value] of Object.entries(options.postgres ?? {})) {
    if (name === 'poolMax' || typeof value !== 'number') continue;
    if (!Number.isInteger(value) || value < 0) {
      throw new RuntimeConfigError(
        `postgres.${name}은(는) 0 이상의 정수여야 합니다.`,
      );
    }
  }
}

function requireNonBlank(name: string, value: string): void {
  if (value.trim() === '') {
    throw new RuntimeConfigError(`${name}은(는) 비어 있을 수 없습니다.`);
  }
}

function requirePositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RuntimeConfigError(`${name}은(는) 1 이상의 정수여야 합니다.`);
  }
}
