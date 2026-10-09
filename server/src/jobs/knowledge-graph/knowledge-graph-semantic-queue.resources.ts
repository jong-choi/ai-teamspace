import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { KNOWLEDGE_GRAPH_SEMANTIC_QUEUE } from '@/jobs/knowledge-graph/knowledge-graph-semantic.job';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import queueConfig from '@/queue/config/queue.config';
import { createProducerRedisOptions } from '@/queue/queue.config';

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const SEMANTIC_PRODUCER_RESOURCES = Symbol(
  'SEMANTIC_PRODUCER_RESOURCES',
);

export function createSemanticProducerResources(
  kg: ConfigType<typeof knowledgeGraphConfig>,
  config: ConfigType<typeof queueConfig>,
) {
  if (!kg.semanticEnabled) return null;
  const connection = new Redis({
    ...createProducerRedisOptions(config.redisUrl),
    connectTimeout: 5000,
    commandTimeout: 5000,
  });
  connection.on('error', () => {});
  const queue = new Queue(KNOWLEDGE_GRAPH_SEMANTIC_QUEUE, {
    prefix: config.prefix,
    connection,
  });
  const logger = new Logger('KnowledgeGraphSemanticQueue');
  queue.on('error', () =>
    logger.warn('KNOWLEDGE_GRAPH_SEMANTIC_QUEUE_CONNECTION_FAILED'),
  );
  return { connection, queue };
}
