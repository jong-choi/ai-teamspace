import { NestFactory } from '@nestjs/core';

import { AppModule } from '#server/app.module.js';
import { parseApiEnvironment } from '#server/config/runtime-environment.js';
import { setupOpenApi } from '#server/openapi.js';

async function bootstrap() {
  const { PORT } = parseApiEnvironment();
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  app.enableShutdownHooks();
  setupOpenApi(app);
  await app.listen(PORT);
}
await bootstrap();
