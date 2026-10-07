export type AgentMcpConnectionsConfig = {
  oauthCallbackUrl: string;
  connectTimeoutMs: number;
  toolTimeoutMs: number;
  maxResponseBytes: number;
  maxToolsPerConnection: number;
  maxConnectionsPerUser: number;
  allowPrivateNetworks: boolean;
};
