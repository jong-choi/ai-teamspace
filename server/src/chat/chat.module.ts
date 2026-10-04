import { Module } from '@nestjs/common';

import { ChatController } from '#server/chat/chat.controller.js';
import { ChatService } from '#server/chat/chat.service.js';
import { ChatDrizzlePersistenceModule } from '#server/chat/infrastructure/persistence/drizzle/drizzle-persistence.module.js';
import { ChatRealtimeModule } from '#server/chat/infrastructure/realtime/redis/chat-realtime.module.js';
import { ChatUserDirectoryModule } from '#server/chat/infrastructure/user-directory/better-auth/user-directory.module.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';

@Module({
  imports: [
    ChatDrizzlePersistenceModule,
    ChatUserDirectoryModule,
    ChatRealtimeModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, TrustedOriginGuard],
  exports: [ChatService],
})
export class ChatModule {}
