import { Module } from '@nestjs/common';

import { ChatRepository } from '@/chat/infrastructure/persistence/chat.repository';
import { ChatDrizzleRepository } from '@/chat/infrastructure/persistence/drizzle/repositories/chat.repository';

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
