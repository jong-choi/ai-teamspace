import { NestFactory } from '@nestjs/core';

import { JobsModule } from '#server/jobs/jobs.module.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(JobsModule);
  app.enableShutdownHooks();
}

await bootstrap();
