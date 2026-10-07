import { agentMcpConnectionsConfigSchema } from '@/agent-mcp-connections/config/agent-mcp-connections.config';

describe('외부 MCP connection 설정', () => {
  test('계획된 기본 bound를 적용한다', () => {
    const config = agentMcpConnectionsConfigSchema.parse({
      AGENT_EXTERNAL_MCP_OAUTH_CALLBACK_URL:
        'http://localhost:3100/agent/mcp/oauth/callback',
    });

    expect(config.AGENT_EXTERNAL_MCP_CONNECT_TIMEOUT_MS).toBe(10_000);
    expect(config.AGENT_EXTERNAL_MCP_TOOL_TIMEOUT_MS).toBe(30_000);
    expect(config.AGENT_EXTERNAL_MCP_MAX_RESPONSE_BYTES).toBe(1_048_576);
    expect(config.AGENT_EXTERNAL_MCP_MAX_TOOLS_PER_CONNECTION).toBe(100);
    expect(config.AGENT_EXTERNAL_MCP_MAX_CONNECTIONS_PER_USER).toBe(10);
    expect(config.AGENT_EXTERNAL_MCP_ALLOW_PRIVATE_NETWORKS).toBe(false);
  });

  test('production에서는 HTTPS callback과 public network 정책을 강제한다', () => {
    expect(() =>
      agentMcpConnectionsConfigSchema.parse({
        NODE_ENV: 'production',
        AGENT_EXTERNAL_MCP_OAUTH_CALLBACK_URL:
          'http://example.com/agent/mcp/oauth/callback',
      }),
    ).toThrow();

    expect(() =>
      agentMcpConnectionsConfigSchema.parse({
        NODE_ENV: 'production',
        AGENT_EXTERNAL_MCP_OAUTH_CALLBACK_URL:
          'https://example.com/agent/mcp/oauth/callback',
        AGENT_EXTERNAL_MCP_ALLOW_PRIVATE_NETWORKS: 'true',
      }),
    ).toThrow();
  });

  test('비정상적으로 큰 timeout과 response bound를 거부한다', () => {
    expect(() =>
      agentMcpConnectionsConfigSchema.parse({
        AGENT_EXTERNAL_MCP_OAUTH_CALLBACK_URL:
          'http://localhost:3100/agent/mcp/oauth/callback',
        AGENT_EXTERNAL_MCP_CONNECT_TIMEOUT_MS: 60_001,
      }),
    ).toThrow();

    expect(() =>
      agentMcpConnectionsConfigSchema.parse({
        AGENT_EXTERNAL_MCP_OAUTH_CALLBACK_URL:
          'http://localhost:3100/agent/mcp/oauth/callback',
        AGENT_EXTERNAL_MCP_MAX_RESPONSE_BYTES: 10 * 1024 * 1024 + 1,
      }),
    ).toThrow();
  });
});
