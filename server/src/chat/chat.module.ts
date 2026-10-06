import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { ChatController } from '@/chat/chat.controller';
import { ChatService } from '@/chat/chat.service';
import { ChatDrizzlePersistenceModule } from '@/chat/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { ChatRealtimeModule } from '@/chat/infrastructure/realtime/redis/chat-realtime.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';

@Module({
  imports: [AuthModule, ChatDrizzlePersistenceModule, ChatRealtimeModule],
  controllers: [ChatController],
  providers: [ChatService, TrustedOriginGuard],
  exports: [ChatService],
})
export class ChatModule {}
