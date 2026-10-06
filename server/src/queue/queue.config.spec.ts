import {
  createProducerRedisOptions,
  createRedisOptions,
  createWorkerRedisOptions,
  DEFAULT_JOB_OPTIONS,
} from '@/queue/queue.config';

describe('BullMQ Redis 연결 설정', () => {
  it('Redis URL을 ioredis 옵션으로 변환한다', () => {
    expect(
      createRedisOptions('redis://worker:secret@redis.example.com:6380/2'),
    ).toEqual({
      host: 'redis.example.com',
      port: 6380,
      username: 'worker',
      password: 'secret',
      db: 2,
      tls: undefined,
    });
  });

  it('rediss URL에는 TLS 옵션을 적용한다', () => {
    expect(createRedisOptions('rediss://redis.example.com')).toMatchObject({
      host: 'redis.example.com',
      port: 6379,
      db: 0,
      tls: {},
    });
  });

  it('producer는 Redis 장애에서 빠르게 실패하도록 구성한다', () => {
    expect(createProducerRedisOptions('redis://localhost:6379')).toMatchObject({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  });

  it('worker는 일시적인 Redis 장애 뒤 재연결할 수 있게 구성한다', () => {
    expect(createWorkerRedisOptions('redis://localhost:6379')).toMatchObject({
      maxRetriesPerRequest: null,
    });
  });

  it('완료 및 실패 작업 보존 개수를 기본값으로 제한한다', () => {
    expect(DEFAULT_JOB_OPTIONS).toEqual({
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 10_000 },
    });
  });

  it('잘못된 Redis database index를 거부한다', () => {
    expect(() =>
      createRedisOptions('redis://localhost:6379/not-a-number'),
    ).toThrow('Redis database index가 올바르지 않습니다.');
  });
});
