import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { parseApiEnvironment } from '@/config/runtime-environment';
import { setupOpenApi } from '@/openapi';

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
