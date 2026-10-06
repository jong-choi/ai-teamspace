import { Module } from '@nestjs/common';

import { WikiCollaborationStateProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-state.provider';
import { YjsCollaborationStateAdapter } from '@/wiki/infrastructure/collaboration/yjs/yjs-collaboration-state.adapter';

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
