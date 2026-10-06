import { Module } from '@nestjs/common';

import { parseCollaborationEnvironment } from '@/config/runtime-environment';
import {
  WIKI_COLLABORATION_ENVIRONMENT,
  type WikiCollaborationEnvironment,
} from '@/wiki/infrastructure/collaboration/wiki-collaboration-configuration.provider';

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
