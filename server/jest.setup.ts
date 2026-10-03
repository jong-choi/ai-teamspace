process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/monorepo_erp_test';
process.env.BETTER_AUTH_SECRET ??=
  'test-secret-value-that-is-at-least-32-characters-long';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.REDIS_QUEUE_URL ??= 'redis://localhost:6380';
process.env.REDIS_CACHE_URL ??= 'redis://localhost:6381';
process.env.BULLMQ_PREFIX ??= 'work-os-test';
