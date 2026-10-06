import { parseAgentEnvironment } from '@/agent/config/agent-environment';

describe('Agent 환경 변수 검증', () => {
  it('durable runtime 전용 Postgres/Redis와 격리 namespace를 검증한다', () => {
    expect(
      parseAgentEnvironment({
        AGENT_DATABASE_URL:
          'postgresql://postgres:postgres@localhost:25432/monorepo_erp',
        AGENT_REDIS_URL: 'redis://localhost:26380',
        AGENT_REDIS_PREFIX: 'work-os:dev:agent',
        AGENT_MODEL: 'openai:gpt-5-mini',
        WORKOS_MCP_URL: 'http://localhost:3000/mcp',
        AGENT_RUN_QUEUE_NAME: 'work-os-dev-agent-runs',
      }),
    ).toMatchObject({
      AGENT_REDIS_PREFIX: 'work-os:dev:agent',
      AGENT_MODEL: 'openai:gpt-5-mini',
      WORKOS_MCP_URL: 'http://localhost:3000/mcp',
      AGENT_MCP_TOOL_TIMEOUT_MS: 30_000,
      AGENT_RUN_QUEUE_NAME: 'work-os-dev-agent-runs',
      AGENT_RUN_CONCURRENCY: 4,
      AGENT_RUN_TIMEOUT_MS: 300_000,
      AGENT_SHUTDOWN_GRACE_MS: 30_000,
      AGENT_MIGRATE_ON_STARTUP: true,
      AGENT_REPLAY_STREAM_TTL_SECONDS: 3_600,
      AGENT_REPLAY_CLOSED_TTL_SECONDS: 86_400,
      AGENT_REPLAY_STREAM_MAXLEN: 10_000,
      AGENT_REPLAY_SUBSCRIBER_BUFFER_FRAMES: 512,
    });
  });

  it('BullMQ queue 이름에 콜론을 허용하지 않는다', () => {
    expect(() =>
      parseAgentEnvironment({
        AGENT_DATABASE_URL: 'postgresql://localhost/agent',
        AGENT_REDIS_URL: 'redis://localhost:6379',
        AGENT_REDIS_PREFIX: 'work-os:agent',
        AGENT_MODEL: 'openai:gpt-5-mini',
        WORKOS_MCP_URL: 'http://localhost:3000/mcp',
        AGENT_RUN_QUEUE_NAME: 'work-os:agent:runs',
      }),
    ).toThrow();
  });

  it('WorkOS MCP URL은 http 또는 https만 허용한다', () => {
    expect(() =>
      parseAgentEnvironment({
        AGENT_DATABASE_URL: 'postgresql://localhost/agent',
        AGENT_REDIS_URL: 'redis://localhost:6379',
        AGENT_REDIS_PREFIX: 'work-os:agent',
        AGENT_MODEL: 'openai:gpt-5-mini',
        WORKOS_MCP_URL: 'ftp://localhost/mcp',
        AGENT_RUN_QUEUE_NAME: 'work-os-agent-runs',
      }),
    ).toThrow();
  });
});
