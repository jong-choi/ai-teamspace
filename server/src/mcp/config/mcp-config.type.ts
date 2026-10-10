export type McpConfig = {
  resourceUrl: string;
  resourceOrigin: string;
  resourcePath: string;
  allowedHosts: string[];
  allowedOrigins: string[];
  protocol: {
    maxRequestBodyBytes: number;
    maxToolInputElements: number;
    requestTimeoutMs: number;
  };
  accessKey: {
    defaultExpiresInDays: number;
    maxExpiresInDays: number;
    maxActivePerUser: number;
    rateLimitWindowMs: number;
    rateLimitMax: number;
    operationRetentionHours: number;
    reservationStaleAfterSeconds: number;
    reconciliationIntervalSeconds: number;
    reconciliationBatchSize: number;
  };
};
