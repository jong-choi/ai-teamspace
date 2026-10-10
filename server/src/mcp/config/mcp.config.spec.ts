import mcpConfig from '@/mcp/config/mcp.config';

describe('MCP 설정', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      MCP_RESOURCE_URL: 'http://127.0.0.1:3100/mcp',
      MCP_ALLOWED_HOSTS: '127.0.0.1,localhost',
      MCP_ALLOWED_ORIGINS: 'localhost,127.0.0.1',
      MCP_MAX_REQUEST_BODY_BYTES: '2048',
      MCP_MAX_TOOL_INPUT_ELEMENTS: '128',
      MCP_REQUEST_TIMEOUT_MS: '5000',
      MCP_ACCESS_KEY_DEFAULT_EXPIRES_IN_DAYS: '30',
      MCP_ACCESS_KEY_MAX_EXPIRES_IN_DAYS: '365',
      MCP_ACCESS_KEY_MAX_ACTIVE_PER_USER: '10',
      MCP_ACCESS_KEY_RATE_LIMIT_WINDOW_MS: '60000',
      MCP_ACCESS_KEY_RATE_LIMIT_MAX: '60',
      MCP_ACCESS_KEY_OPERATION_RETENTION_HOURS: '24',
      MCP_ACCESS_KEY_RESERVATION_STALE_AFTER_SECONDS: '300',
    };
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('canonical resource와 allowlist를 정규화한다', () => {
    process.env.MCP_ALLOWED_HOSTS = 'localhost, 127.0.0.1,localhost';

    expect(mcpConfig()).toEqual({
      resourceUrl: 'http://127.0.0.1:3100/mcp',
      resourceOrigin: 'http://127.0.0.1:3100',
      resourcePath: '/mcp',
      allowedHosts: ['localhost', '127.0.0.1'],
      allowedOrigins: ['localhost', '127.0.0.1'],
      protocol: {
        maxRequestBodyBytes: 2048,
        maxToolInputElements: 128,
        requestTimeoutMs: 5000,
      },
      accessKey: {
        defaultExpiresInDays: 30,
        maxExpiresInDays: 365,
        maxActivePerUser: 10,
        rateLimitWindowMs: 60000,
        rateLimitMax: 60,
        operationRetentionHours: 24,
        reservationStaleAfterSeconds: 300,
        reconciliationIntervalSeconds: 900,
        reconciliationBatchSize: 100,
      },
    });
  });

  it('공개 HTTP resource를 거부한다', () => {
    process.env.MCP_RESOURCE_URL = 'http://example.com/mcp';

    expect(() => mcpConfig()).toThrow(
      'MCP_RESOURCE_URL은 HTTPS여야 하며 로컬 개발에서는 loopback HTTP만 허용됩니다.',
    );
  });

  it('query와 fragment가 있는 resource를 거부한다', () => {
    process.env.MCP_RESOURCE_URL = 'https://example.com/mcp?tenant=a#fragment';

    expect(() => mcpConfig()).toThrow(
      'MCP_RESOURCE_URL에는 query 또는 fragment를 포함할 수 없습니다.',
    );
  });

  it('잘못된 resource path를 거부한다', () => {
    process.env.MCP_RESOURCE_URL = 'https://example.com/api/mcp';

    expect(() => mcpConfig()).toThrow(
      'MCP_RESOURCE_URL의 path는 /mcp여야 합니다.',
    );
  });

  it('빈 allowlist를 거부한다', () => {
    process.env.MCP_ALLOWED_HOSTS = '   ';

    expect(() => mcpConfig()).toThrow();
  });

  it('access key 기본 만료 기간이 최대 기간보다 크면 거부한다', () => {
    process.env.MCP_ACCESS_KEY_DEFAULT_EXPIRES_IN_DAYS = '366';
    process.env.MCP_ACCESS_KEY_MAX_EXPIRES_IN_DAYS = '365';

    expect(() => mcpConfig()).toThrow(
      'MCP access key 기본 만료 기간은 최대 만료 기간보다 클 수 없습니다.',
    );
  });

  it('access key rate limit과 active key 제한은 양수만 허용한다', () => {
    process.env.MCP_ACCESS_KEY_RATE_LIMIT_MAX = '0';

    expect(() => mcpConfig()).toThrow();
  });

  it('access key reconciliation 주기와 page 크기는 허용 범위 밖이면 거부한다', () => {
    process.env.MCP_ACCESS_KEY_RECONCILIATION_INTERVAL_SECONDS = '59';
    expect(() => mcpConfig()).toThrow();

    process.env.MCP_ACCESS_KEY_RECONCILIATION_INTERVAL_SECONDS = '900';
    process.env.MCP_ACCESS_KEY_RECONCILIATION_BATCH_SIZE = '0';
    expect(() => mcpConfig()).toThrow();
  });
});
