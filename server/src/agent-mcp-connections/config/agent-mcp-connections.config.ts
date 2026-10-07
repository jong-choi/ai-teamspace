import type { AgentMcpConnectionsConfig } from '@/agent-mcp-connections/config/agent-mcp-connections-config.type';
import validateConfig from '@/utils/validate-config';

import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const callbackUrlSchema = z
  .url()
  .transform((value) => new URL(value))
  .superRefine((url, context) => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        message: 'external MCP OAuth callback URL은 http 또는 https URL이어야 합니다.',
      });
    }
    if (url.username || url.password || url.search || url.hash) {
      context.addIssue({
        code: 'custom',
        message:
          'external MCP OAuth callback URL에는 credential, query 또는 fragment를 포함할 수 없습니다.',
      });
    }
  })
  .transform((url) => url.toString());

const boundedInteger = (maximum: number, defaultValue: number) =>
  z.coerce.number().int().min(1).max(maximum).default(defaultValue);

export const agentMcpConnectionsConfigSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    AGENT_EXTERNAL_MCP_OAUTH_CALLBACK_URL: callbackUrlSchema,
    AGENT_EXTERNAL_MCP_CONNECT_TIMEOUT_MS: boundedInteger(60_000, 10_000),
    AGENT_EXTERNAL_MCP_TOOL_TIMEOUT_MS: boundedInteger(300_000, 30_000),
    AGENT_EXTERNAL_MCP_MAX_RESPONSE_BYTES: boundedInteger(
      10 * 1024 * 1024,
      1_048_576,
    ),
    AGENT_EXTERNAL_MCP_MAX_TOOLS_PER_CONNECTION: boundedInteger(500, 100),
    AGENT_EXTERNAL_MCP_MAX_CONNECTIONS_PER_USER: boundedInteger(50, 10),
    AGENT_EXTERNAL_MCP_ALLOW_PRIVATE_NETWORKS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      environment.AGENT_EXTERNAL_MCP_ALLOW_PRIVATE_NETWORKS
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AGENT_EXTERNAL_MCP_ALLOW_PRIVATE_NETWORKS'],
        message:
          'production에서는 external MCP private network 접근을 허용할 수 없습니다.',
      });
    }

    if (
      environment.NODE_ENV === 'production' &&
      !environment.AGENT_EXTERNAL_MCP_OAUTH_CALLBACK_URL.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AGENT_EXTERNAL_MCP_OAUTH_CALLBACK_URL'],
        message:
          'production external MCP OAuth callback URL은 HTTPS여야 합니다.',
      });
    }
  });

export default registerAs<AgentMcpConnectionsConfig>(
  'agentMcpConnections',
  () => {
    const environment = validateConfig(
      process.env,
      agentMcpConnectionsConfigSchema,
    );

    return {
      oauthCallbackUrl: environment.AGENT_EXTERNAL_MCP_OAUTH_CALLBACK_URL,
      connectTimeoutMs: environment.AGENT_EXTERNAL_MCP_CONNECT_TIMEOUT_MS,
      toolTimeoutMs: environment.AGENT_EXTERNAL_MCP_TOOL_TIMEOUT_MS,
      maxResponseBytes: environment.AGENT_EXTERNAL_MCP_MAX_RESPONSE_BYTES,
      maxToolsPerConnection:
        environment.AGENT_EXTERNAL_MCP_MAX_TOOLS_PER_CONNECTION,
      maxConnectionsPerUser:
        environment.AGENT_EXTERNAL_MCP_MAX_CONNECTIONS_PER_USER,
      allowPrivateNetworks:
        environment.AGENT_EXTERNAL_MCP_ALLOW_PRIVATE_NETWORKS,
    };
  },
);
