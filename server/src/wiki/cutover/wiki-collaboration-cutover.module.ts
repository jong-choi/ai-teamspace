import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import databaseConfig from '@/database/config/database.config';
import { DatabaseModule } from '@/database/database.module';
import { WikiCollaborationCutoverDrizzleRepository } from '@/wiki/cutover/infrastructure/drizzle/wiki-collaboration-cutover.repository';
import { WikiCollaborationCutoverRepository } from '@/wiki/cutover/wiki-collaboration-cutover.repository';
import { WikiCollaborationCutoverService } from '@/wiki/cutover/wiki-collaboration-cutover.service';
import { WikiCollaborationStateProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-state.provider';
import { YjsCollaborationStateAdapter } from '@/wiki/infrastructure/collaboration/yjs/yjs-collaboration-state.adapter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath: ['.env'],
    }),
    DatabaseModule,
  ],
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
