import { Module } from '@nestjs/common';

import { ChatRealtimeProvider } from '#server/chat/infrastructure/realtime/chat-realtime.provider.js';
import { RedisChatRealtimeAdapter } from '#server/chat/infrastructure/realtime/redis/chat-realtime.adapter.js';

@Module({
  providers: [
    {
      provide: ChatRealtimeProvider,
      useClass: RedisChatRealtimeAdapter,
    },
  ],
  exports: [ChatRealtimeProvider],
})
export class ChatRealtimeModule {}
