export type McpConfig = {
  resourceUrl: string;
  resourceOrigin: string;
  resourcePath: string;
  allowedHosts: string[];
  allowedOrigins: string[];
  protocol: {
    modernOnly: true;
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
  };
  agentDelegation: {
    clientId: string;
    clientSecret: string;
    redirectUrl: string;
    flowTtlSeconds: number;
    refreshLeaseTtlSeconds: number;
    refreshLeaseWaitMs: number;
  };
};
