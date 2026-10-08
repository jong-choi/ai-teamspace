import { NestFactory } from '@nestjs/core';

import { WikiCollaborationModule } from '@/wiki/collaboration/wiki-collaboration.module';
import { HocuspocusWikiCollaborationRuntime } from '@/wiki/infrastructure/collaboration/hocuspocus/hocuspocus-wiki-collaboration.runtime';

describe('위키 공동편집 서버 root module 통합', () => {
  it('독립 process root module이 필요한 config로 부팅된다', async () => {
    const app = await NestFactory.createApplicationContext(
      WikiCollaborationModule,
      { abortOnError: false, logger: false },
    );
    try {
      expect(app.get(HocuspocusWikiCollaborationRuntime)).toBeDefined();
    } finally {
      await app.close();
    }
  });
});
