import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

process.env.DATABASE_URL ??=
  'postgresql://openapi:openapi@127.0.0.1:1/openapi-contract';
process.env.BETTER_AUTH_SECRET ??=
  'openapi-contract-generation-secret-value-32-characters';
process.env.BETTER_AUTH_URL ??= 'http://127.0.0.1:3000';
process.env.REDIS_CACHE_URL ??= 'redis://127.0.0.1:1';
process.env.REDIS_QUEUE_URL ??= 'redis://127.0.0.1:1';
process.env.BULLMQ_PREFIX ??= 'openapi-contract';
process.env.REDIS_COLLABORATION_URL ??= 'redis://127.0.0.1:1';
process.env.COLLABORATION_PUBLIC_URL ??= 'ws://127.0.0.1:3002';
process.env.COLLABORATION_JWT_SECRET ??=
  'openapi-collaboration-generation-secret-value-32-characters';

const [{ NestFactory }, { AppModule }, { createOpenApiDocument }] =
  await Promise.all([
    import('@nestjs/core'),
    import('@/app.module'),
    import('@/openapi'),
  ]);

const app = await NestFactory.create(AppModule, {
  bodyParser: false,
  logger: false,
});

try {
  const document = createOpenApiDocument(app);
  await writeFile(
    resolve(process.cwd(), 'dist/openapi.json'),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );
} finally {
  await app.close();
}
