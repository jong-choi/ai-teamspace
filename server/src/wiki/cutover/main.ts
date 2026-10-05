import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WikiCollaborationCutoverModule } from '#server/wiki/cutover/wiki-collaboration-cutover.module.js';
import { WikiCollaborationCutoverService } from '#server/wiki/cutover/wiki-collaboration-cutover.service.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(
    WikiCollaborationCutoverModule,
  );
  try {
    await app.get(WikiCollaborationCutoverService).run();
    Logger.log('위키 공동편집 cutover가 완료되었습니다.', 'WikiCutover');
  } finally {
    await app.close();
  }
}

await bootstrap();
