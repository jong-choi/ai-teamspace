import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { addProblemDetailsSchema } from 'nest-problem-details-filter/swagger';

const openApiConfig = new DocumentBuilder()
  .setTitle('Work OS API')
  .setVersion('1.0')
  .build();

export function createOpenApiDocument(app: INestApplication) {
  const document = SwaggerModule.createDocument(app, openApiConfig);
  addProblemDetailsSchema(document);
  return document;
}

export function setupOpenApi(app: INestApplication) {
  const document = createOpenApiDocument(app);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
  });
}
