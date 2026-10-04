import { Module } from '@nestjs/common';

import { ChatRepository } from '#server/chat/infrastructure/persistence/chat.repository.js';
import { ChatDrizzleRepository } from '#server/chat/infrastructure/persistence/drizzle/repositories/chat.repository.js';

@Module({
  providers: [
    {
      provide: ChatRepository,
      useClass: ChatDrizzleRepository,
    },
  ],
  exports: [ChatRepository],
})
export class ChatDrizzlePersistenceModule {}
