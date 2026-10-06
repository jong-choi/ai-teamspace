export type AgentConfig = {
  databaseUrl: string;
  redisUrl: string;
  redisPrefix: string;
  model: string;
  workOsMcpUrl: string;
  mcpToolTimeoutMs: number;
  runQueueName: string;
  runConcurrency: number;
  runTimeoutMs: number;
  shutdownGraceMs: number;
  migrateOnStartup: boolean;
  replayStreamTtlSeconds: number;
  replayClosedTtlSeconds: number;
  replayStreamMaxLength: number;
  replaySubscriberBufferFrames: number;
};
