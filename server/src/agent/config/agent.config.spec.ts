import agentConfig from '@/agent/config/agent.config';

describe('Agent 설정', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      AGENT_DATABASE_URL: 'postgresql://localhost/agent-test',
      AGENT_REDIS_URL: 'redis://localhost:6379',
      AGENT_REDIS_PREFIX: 'agent-test',
      AGENT_MODEL: 'gpt-oss:120b',
      OLLAMA_API_KEY: 'test-ollama-key',
      OLLAMA_BASE_URL: 'https://ollama.com/',
      AGENT_RUN_QUEUE_NAME: 'agent-test-runs',
      LANGFUSE_ENABLED: 'false',
    };
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_TRACING_ENVIRONMENT;
    delete process.env.LANGFUSE_RELEASE;
    delete process.env.LANGFUSE_SAMPLE_RATE;
    delete process.env.LANGFUSE_CAPTURE_LEVEL;
    delete process.env.LANGFUSE_ID_HASH_SECRET;
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('Ollama production model 설정을 정규화한다', async () => {
    const config = await loadAgentConfig();

    expect(config.model).toEqual({
      name: 'gpt-oss:120b',
      baseUrl: 'https://ollama.com',
      apiKey: 'test-ollama-key',
    });
  });

  it('공개 HTTP Ollama endpoint를 거부한다', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama.example.com';

    await expect(loadAgentConfig()).rejects.toThrow(
      'OLLAMA_BASE_URL은 HTTPS여야 하며 로컬 개발에서는 loopback HTTP만 허용됩니다.',
    );
  });

  it('Ollama API key가 비어 있으면 시작 단계에서 거부한다', async () => {
    process.env.OLLAMA_API_KEY = '   ';

    await expect(loadAgentConfig()).rejects.toThrow();
  });

  it('path가 포함된 Ollama base URL을 거부한다', async () => {
    process.env.OLLAMA_BASE_URL = 'https://ollama.com/api';

    await expect(loadAgentConfig()).rejects.toThrow(
      'OLLAMA_BASE_URL은 origin URL이어야 합니다.',
    );
  });

  it('Langfuse가 꺼져 있으면 credential 없이 metadata-only 기본값을 사용한다', async () => {
    const config = await loadAgentConfig();

    expect(config.observability?.langfuse).toMatchObject({
      enabled: false,
      tracingEnvironment: 'development',
      sampleRate: 1,
      captureLevel: 'metadata',
    });
  });

  it('Langfuse가 켜지면 검증된 credential과 capture 설정을 정규화한다', async () => {
    process.env.LANGFUSE_ENABLED = 'true';
    process.env.LANGFUSE_BASE_URL = 'https://cloud.langfuse.com';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    process.env.LANGFUSE_TRACING_ENVIRONMENT = 'test';
    process.env.LANGFUSE_RELEASE = 'build-123';
    process.env.LANGFUSE_SAMPLE_RATE = '0.25';
    process.env.LANGFUSE_CAPTURE_LEVEL = 'sanitized-content';
    process.env.LANGFUSE_ID_HASH_SECRET = '0123456789abcdef0123456789abcdef';

    const config = await loadAgentConfig();

    expect(config.observability?.langfuse).toEqual({
      enabled: true,
      baseUrl: 'https://cloud.langfuse.com',
      publicKey: 'pk-test',
      secretKey: 'sk-test',
      tracingEnvironment: 'test',
      release: 'build-123',
      sampleRate: 0.25,
      captureLevel: 'sanitized-content',
      idHashSecret: '0123456789abcdef0123456789abcdef',
    });
  });

  it('Langfuse 활성화 시 credential이 빠지면 시작 단계에서 거부한다', async () => {
    process.env.LANGFUSE_ENABLED = 'true';

    await expect(loadAgentConfig()).rejects.toThrow(
      'LANGFUSE_BASE_URL는 LANGFUSE_ENABLED=true일 때 필수입니다.',
    );
  });

  it('Langfuse credential을 평문으로 보내는 공개 HTTP endpoint를 거부한다', async () => {
    enableLangfuse('http://langfuse.example.com');

    await expect(loadAgentConfig()).rejects.toThrow(
      'LANGFUSE_BASE_URL은 HTTPS여야 하며 로컬 개발에서는 loopback HTTP만 허용됩니다.',
    );
  });

  it('로컬 self-hosted Langfuse의 loopback HTTP endpoint는 허용한다', async () => {
    enableLangfuse('http://localhost:3300');

    const config = await loadAgentConfig();

    expect(config.observability?.langfuse?.baseUrl).toBe(
      'http://localhost:3300',
    );
  });

  it('Langfuse 식별자 해시 secret이 32바이트보다 짧으면 거부한다', async () => {
    process.env.LANGFUSE_ENABLED = 'true';
    process.env.LANGFUSE_BASE_URL = 'https://cloud.langfuse.com';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    process.env.LANGFUSE_ID_HASH_SECRET = 'too-short';

    await expect(loadAgentConfig()).rejects.toThrow(
      'LANGFUSE_ID_HASH_SECRET은 UTF-8 기준 최소 32바이트여야 합니다.',
    );
  });
});

async function loadAgentConfig() {
  return agentConfig();
}

function enableLangfuse(baseUrl: string) {
  process.env.LANGFUSE_ENABLED = 'true';
  process.env.LANGFUSE_BASE_URL = baseUrl;
  process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
  process.env.LANGFUSE_SECRET_KEY = 'sk-test';
  process.env.LANGFUSE_ID_HASH_SECRET = '0123456789abcdef0123456789abcdef';
}
