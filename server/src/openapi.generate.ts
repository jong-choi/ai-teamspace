import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import '@/openapi-environment';
import { AppCoreModule } from '@/app-core.module';
import { createOpenApiDocument } from '@/openapi';

import { NestFactory } from '@nestjs/core';

const app = await NestFactory.create(AppCoreModule, {
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
