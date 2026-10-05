import { Module } from '@nestjs/common';

import { DatabaseModule } from '#server/database/database.module.js';
import { WikiCollaborationCutoverDrizzleRepository } from '#server/wiki/cutover/infrastructure/drizzle/wiki-collaboration-cutover.repository.js';
import { WikiCollaborationCutoverRepository } from '#server/wiki/cutover/wiki-collaboration-cutover.repository.js';
import { WikiCollaborationCutoverService } from '#server/wiki/cutover/wiki-collaboration-cutover.service.js';
import { WikiCollaborationStateProvider } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-state.provider.js';
import { YjsCollaborationStateAdapter } from '#server/wiki/infrastructure/collaboration/yjs/yjs-collaboration-state.adapter.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    WikiCollaborationCutoverService,
    {
      provide: WikiCollaborationCutoverRepository,
      useClass: WikiCollaborationCutoverDrizzleRepository,
    },
    {
      provide: WikiCollaborationStateProvider,
      useClass: YjsCollaborationStateAdapter,
    },
  ],
})
export class WikiCollaborationCutoverModule {}
