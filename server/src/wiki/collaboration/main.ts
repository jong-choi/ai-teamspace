import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WikiCollaborationModule } from '#server/wiki/collaboration/wiki-collaboration.module.js';
import { HocuspocusWikiCollaborationRuntime } from '#server/wiki/infrastructure/collaboration/hocuspocus/hocuspocus-wiki-collaboration.runtime.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(
    WikiCollaborationModule,
  );
  const runtime = app.get(HocuspocusWikiCollaborationRuntime);
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    Logger.log(`위키 공동편집 서버 종료를 시작합니다: ${signal}`, 'Bootstrap');
    await runtime.stop();
    await app.close();
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  try {
    await runtime.start();
  } catch (error) {
    await runtime.stop();
    await app.close();
    throw error;
  }
}

await bootstrap();
