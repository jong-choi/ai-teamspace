import {
  parseApiEnvironment,
  parseAuthEnvironment,
  parseCacheEnvironment,
  parseCollaborationEnvironment,
  parseDatabaseEnvironment,
  parseQueueEnvironment,
} from '@/config/runtime-environment';

describe('런타임 환경 변수 검증', () => {
  it('API 포트의 기본값과 명시값을 파싱한다', () => {
    expect(parseApiEnvironment({}).PORT).toBe(3000);
    expect(parseApiEnvironment({ PORT: '4100' }).PORT).toBe(4100);
  });

  it('필수 데이터베이스 URL이 없으면 실패한다', () => {
    expect(() => parseDatabaseEnvironment({})).toThrow();
  });

  it('PostgreSQL URL만 데이터베이스 URL로 허용한다', () => {
    expect(
      parseDatabaseEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/work_os',
      }).DATABASE_URL,
    ).toBe('postgresql://postgres:postgres@localhost:5432/work_os');

    expect(() =>
      parseDatabaseEnvironment({ DATABASE_URL: 'https://example.com' }),
    ).toThrow();
  });

  it('Better Auth secret 길이와 URL 프로토콜을 검증한다', () => {
    expect(() =>
      parseAuthEnvironment({
        BETTER_AUTH_SECRET: 'short',
        BETTER_AUTH_URL: 'http://localhost:3000',
      }),
    ).toThrow();

    expect(
      parseAuthEnvironment({
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        BETTER_AUTH_URL: 'https://work-os.example.com',
      }),
    ).toEqual({
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      BETTER_AUTH_URL: 'https://work-os.example.com',
    });
  });

  it('queue와 cache Redis URL을 서로 독립적으로 검증한다', () => {
    expect(
      parseQueueEnvironment({
        REDIS_QUEUE_URL: 'rediss://queue.example.com:6380/1',
        BULLMQ_PREFIX: 'work-os',
      }),
    ).toEqual({
      REDIS_QUEUE_URL: 'rediss://queue.example.com:6380/1',
      BULLMQ_PREFIX: 'work-os',
    });

    expect(
      parseCacheEnvironment({ REDIS_CACHE_URL: 'redis://localhost:6381' }),
    ).toEqual({ REDIS_CACHE_URL: 'redis://localhost:6381' });

    expect(() =>
      parseCacheEnvironment({ REDIS_CACHE_URL: 'http://localhost:6381' }),
    ).toThrow();
  });

  it('공동편집은 전용 Redis와 ws/wss public URL, 충분히 긴 secret을 요구한다', () => {
    expect(
      parseCollaborationEnvironment({
        COLLABORATION_PORT: '4102',
        COLLABORATION_PUBLIC_URL: 'wss://collaboration.example.com',
        COLLABORATION_JWT_SECRET: 'c'.repeat(32),
        REDIS_COLLABORATION_URL: 'rediss://collaboration.example.com:6382/2',
      }),
    ).toEqual({
      COLLABORATION_PORT: 4102,
      COLLABORATION_PUBLIC_URL: 'wss://collaboration.example.com',
      COLLABORATION_JWT_SECRET: 'c'.repeat(32),
      REDIS_COLLABORATION_URL: 'rediss://collaboration.example.com:6382/2',
    });

    expect(() =>
      parseCollaborationEnvironment({
        COLLABORATION_PUBLIC_URL: 'https://collaboration.example.com',
        COLLABORATION_JWT_SECRET: 'short',
        REDIS_COLLABORATION_URL: 'redis://localhost:6382',
      }),
    ).toThrow();
  });
});
