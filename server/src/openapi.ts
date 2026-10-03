import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const openApiConfig = new DocumentBuilder()
  .setTitle('Work OS API')
  .setVersion('1.0')
  .build();

export function createOpenApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(app, openApiConfig);
}

export function setupOpenApi(app: INestApplication) {
  const document = createOpenApiDocument(app);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
  });
}
