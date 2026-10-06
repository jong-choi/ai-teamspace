import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ChatRealtimeProvider } from '@/chat/infrastructure/realtime/chat-realtime.provider';
import { RedisChatRealtimeAdapter } from '@/chat/infrastructure/realtime/redis/chat-realtime.adapter';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: ChatRealtimeProvider,
      useClass: RedisChatRealtimeAdapter,
    },
  ],
  exports: [ChatRealtimeProvider],
})
export class ChatRealtimeModule {}
