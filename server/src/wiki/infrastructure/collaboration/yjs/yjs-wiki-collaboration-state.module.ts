import { Module } from '@nestjs/common';

import { WikiCollaborationStateProvider } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-state.provider.js';
import { YjsCollaborationStateAdapter } from '#server/wiki/infrastructure/collaboration/yjs/yjs-collaboration-state.adapter.js';

@Module({
  providers: [
    {
      provide: WikiCollaborationStateProvider,
      useClass: YjsCollaborationStateAdapter,
    },
  ],
  exports: [WikiCollaborationStateProvider],
})
export class YjsWikiCollaborationStateModule {}
