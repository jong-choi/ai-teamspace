import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppCoreModule } from '@/app-core.module';
import authConfig from '@/auth/config/auth.config';
import cacheConfig from '@/chat/config/cache.config';
import appConfig from '@/config/app.config';
import databaseConfig from '@/database/config/database.config';
import { createOpenApiDocument } from '@/openapi';
import queueConfig from '@/queue/config/queue.config';
import collaborationConfig from '@/wiki/infrastructure/collaboration/config/collaboration.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        authConfig,
        cacheConfig,
        collaborationConfig,
        databaseConfig,
        queueConfig,
      ],
      envFilePath: ['.env'],
    }),
    AppCoreModule,
  ],
})
class OpenApiModule {}

const app = await NestFactory.create(OpenApiModule, {
  abortOnError: false,
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
