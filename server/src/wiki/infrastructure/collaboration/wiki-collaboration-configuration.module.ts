import { Module } from '@nestjs/common';

import { parseCollaborationEnvironment } from '#server/config/runtime-environment.js';
import {
  WIKI_COLLABORATION_ENVIRONMENT,
  type WikiCollaborationEnvironment,
} from '#server/wiki/infrastructure/collaboration/wiki-collaboration-configuration.provider.js';

@Module({
  providers: [
    {
      provide: WIKI_COLLABORATION_ENVIRONMENT,
      useFactory: (): WikiCollaborationEnvironment =>
        parseCollaborationEnvironment(),
    },
  ],
  exports: [WIKI_COLLABORATION_ENVIRONMENT],
})
export class WikiCollaborationConfigurationModule {}
