import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from '@/app.module';
import type { AllConfigType } from '@/config/config.type';
import { setupOpenApi } from '@/openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  const configService = app.get(ConfigService<AllConfigType>);
  const corsOrigins = configService.getOrThrow('app.corsOrigins', {
    infer: true,
  });
  app.enableCors({
    credentials: true,
    origin: corsOrigins,
  });
  app.enableShutdownHooks();
  setupOpenApi(app);
  await app.listen(configService.getOrThrow('app.port', { infer: true }));
}
await bootstrap();
