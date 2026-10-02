import { NestFactory } from '@nestjs/core';

import { AppModule } from '#server/app.module.js';
import { parseApiEnvironment } from '#server/config/runtime-environment.js';

async function bootstrap() {
  const { PORT } = parseApiEnvironment();
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  app.enableShutdownHooks();
  await app.listen(PORT);
}
await bootstrap();
