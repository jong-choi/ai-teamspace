export type AgentConfig = {
  databaseUrl: string;
  redisUrl: string;
  redisPrefix: string;
  model: {
    name: string;
    baseUrl: string;
    apiKey: string;
  };
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
  observability?: {
    langfuse: {
      enabled: boolean;
      baseUrl?: string;
      publicKey?: string;
      secretKey?: string;
      tracingEnvironment: string;
      release?: string;
      sampleRate: number;
      captureLevel: 'metadata' | 'sanitized-content';
      idHashSecret?: string;
    };
  };
};
