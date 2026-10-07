import { registerAs } from '@nestjs/config';

import type { McpConfig } from '@/mcp/config/mcp-config.type';
import validateConfig from '@/utils/validate-config';

import { z } from 'zod';

const commaSeparatedListSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) =>
    [...new Set(value.split(',').map((item) => item.trim()))].filter(Boolean),
  )
  .pipe(z.array(z.string().min(1)).min(1));

const secureOrLoopbackUrlSchema = (label: string) =>
  z
    .url()
    .transform((value) => new URL(value))
    .superRefine((url, context) => {
      if (url.username || url.password) {
        context.addIssue({
          code: 'custom',
          message: `${label}에는 credential을 포함할 수 없습니다.`,
        });
      }

      const isLoopback =
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '[::1]';

      if (
        url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && isLoopback)
      ) {
        context.addIssue({
          code: 'custom',
          message: `${label}은 HTTPS여야 하며 로컬 개발에서는 loopback HTTP만 허용됩니다.`,
        });
      }
    });

const mcpResourceUrlSchema = secureOrLoopbackUrlSchema('MCP_RESOURCE_URL')
  .superRefine((url, context) => {
    if (url.username || url.password) {
      context.addIssue({
        code: 'custom',
        message: 'MCP_RESOURCE_URL에는 credential을 포함할 수 없습니다.',
      });
    }

    if (url.search || url.hash) {
      context.addIssue({
        code: 'custom',
        message:
          'MCP_RESOURCE_URL에는 query 또는 fragment를 포함할 수 없습니다.',
      });
    }

    if (url.pathname !== '/mcp') {
      context.addIssue({
        code: 'custom',
        message: 'MCP_RESOURCE_URL의 path는 /mcp여야 합니다.',
      });
    }
  })
  .transform((url) => url.href);

const agentDelegationRedirectUrlSchema = secureOrLoopbackUrlSchema(
  'MCP Agent OAuth redirect URL',
)
  .superRefine((url, context) => {
    if (url.search || url.hash) {
      context.addIssue({
        code: 'custom',
        message:
          'MCP Agent OAuth redirect URL에는 query 또는 fragment를 포함할 수 없습니다.',
      });
    }

    if (url.pathname !== '/mcp/agent-delegation/callback') {
      context.addIssue({
        code: 'custom',
        message:
          'MCP Agent OAuth redirect URL의 path는 /mcp/agent-delegation/callback 이어야 합니다.',
      });
    }
  })
  .transform((url) => url.href);

const mcpConfigSchema = z
  .object({
    MCP_RESOURCE_URL: mcpResourceUrlSchema,
    MCP_ALLOWED_HOSTS: commaSeparatedListSchema,
    MCP_ALLOWED_ORIGINS: commaSeparatedListSchema,
    MCP_MAX_REQUEST_BODY_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(104_857),
    MCP_MAX_TOOL_INPUT_ELEMENTS: z.coerce
      .number()
      .int()
      .positive()
      .default(1_000),
    MCP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    MCP_ACCESS_KEY_DEFAULT_EXPIRES_IN_DAYS: z.coerce.number().int().positive(),
    MCP_ACCESS_KEY_MAX_EXPIRES_IN_DAYS: z.coerce.number().int().positive(),
    MCP_ACCESS_KEY_MAX_ACTIVE_PER_USER: z.coerce.number().int().positive(),
    MCP_ACCESS_KEY_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
    MCP_ACCESS_KEY_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
    MCP_ACCESS_KEY_OPERATION_RETENTION_HOURS: z.coerce
      .number()
      .int()
      .positive(),
    MCP_ACCESS_KEY_RESERVATION_STALE_AFTER_SECONDS: z.coerce
      .number()
      .int()
      .positive(),
    MCP_AGENT_OAUTH_CLIENT_ID: z.string().trim().min(1).max(256),
    MCP_AGENT_OAUTH_CLIENT_SECRET: z.string().min(32).max(512),
    MCP_AGENT_OAUTH_REDIRECT_URL: agentDelegationRedirectUrlSchema,
    MCP_AGENT_OAUTH_FLOW_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(1_800),
    MCP_AGENT_OAUTH_REFRESH_LEASE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(5)
      .max(60),
    MCP_AGENT_OAUTH_REFRESH_LEASE_WAIT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(10_000),
  })
  .superRefine((environment, context) => {
    if (
      environment.MCP_ACCESS_KEY_DEFAULT_EXPIRES_IN_DAYS >
      environment.MCP_ACCESS_KEY_MAX_EXPIRES_IN_DAYS
    ) {
      context.addIssue({
        code: 'custom',
        path: ['MCP_ACCESS_KEY_DEFAULT_EXPIRES_IN_DAYS'],
        message:
          'MCP access key 기본 만료 기간은 최대 만료 기간보다 클 수 없습니다.',
      });
    }

    if (
      environment.MCP_AGENT_OAUTH_REFRESH_LEASE_WAIT_MS >
      environment.MCP_AGENT_OAUTH_REFRESH_LEASE_TTL_SECONDS * 1_000
    ) {
      context.addIssue({
        code: 'custom',
        path: ['MCP_AGENT_OAUTH_REFRESH_LEASE_WAIT_MS'],
        message:
          'MCP Agent OAuth refresh lease 대기 시간은 lease TTL보다 길 수 없습니다.',
      });
    }
  });

export function createMcpConfig(): McpConfig {
  const environment = validateConfig(process.env, mcpConfigSchema);
  const resourceUrl = new URL(environment.MCP_RESOURCE_URL);

  return {
    resourceUrl: environment.MCP_RESOURCE_URL,
    resourceOrigin: resourceUrl.origin,
    resourcePath: resourceUrl.pathname,
    allowedHosts: environment.MCP_ALLOWED_HOSTS,
    allowedOrigins: environment.MCP_ALLOWED_ORIGINS,
    protocol: {
      modernOnly: true,
      maxRequestBodyBytes: environment.MCP_MAX_REQUEST_BODY_BYTES,
      maxToolInputElements: environment.MCP_MAX_TOOL_INPUT_ELEMENTS,
      requestTimeoutMs: environment.MCP_REQUEST_TIMEOUT_MS,
    },
    accessKey: {
      defaultExpiresInDays: environment.MCP_ACCESS_KEY_DEFAULT_EXPIRES_IN_DAYS,
      maxExpiresInDays: environment.MCP_ACCESS_KEY_MAX_EXPIRES_IN_DAYS,
      maxActivePerUser: environment.MCP_ACCESS_KEY_MAX_ACTIVE_PER_USER,
      rateLimitWindowMs: environment.MCP_ACCESS_KEY_RATE_LIMIT_WINDOW_MS,
      rateLimitMax: environment.MCP_ACCESS_KEY_RATE_LIMIT_MAX,
      operationRetentionHours:
        environment.MCP_ACCESS_KEY_OPERATION_RETENTION_HOURS,
      reservationStaleAfterSeconds:
        environment.MCP_ACCESS_KEY_RESERVATION_STALE_AFTER_SECONDS,
    },
    agentDelegation: {
      clientId: environment.MCP_AGENT_OAUTH_CLIENT_ID,
      clientSecret: environment.MCP_AGENT_OAUTH_CLIENT_SECRET,
      redirectUrl: environment.MCP_AGENT_OAUTH_REDIRECT_URL,
      flowTtlSeconds: environment.MCP_AGENT_OAUTH_FLOW_TTL_SECONDS,
      refreshLeaseTtlSeconds:
        environment.MCP_AGENT_OAUTH_REFRESH_LEASE_TTL_SECONDS,
      refreshLeaseWaitMs: environment.MCP_AGENT_OAUTH_REFRESH_LEASE_WAIT_MS,
    },
  };
}

export default registerAs<McpConfig>('mcp', createMcpConfig);
