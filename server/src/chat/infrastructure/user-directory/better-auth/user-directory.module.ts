import { Module } from '@nestjs/common';

import { AuthModule } from '#server/auth/auth.module.js';
import { BetterAuthChatUserDirectory } from '#server/chat/infrastructure/user-directory/better-auth/user-directory.adapter.js';
import { ChatUserDirectory } from '#server/chat/infrastructure/user-directory/user-directory.provider.js';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: ChatUserDirectory,
      useClass: BetterAuthChatUserDirectory,
    },
  ],
  exports: [ChatUserDirectory],
})
export class ChatUserDirectoryModule {}
