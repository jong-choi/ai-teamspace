import { Module } from '@nestjs/common';

import { createAuth } from '#server/auth/auth.js';
import { AuthUserDirectoryService } from '#server/auth/auth-user-directory.service.js';
import { AuthUserDirectory } from '#server/auth/infrastructure/user-directory/auth-user-directory.provider.js';
import { BetterAuthUserDirectory } from '#server/auth/infrastructure/user-directory/better-auth-user-directory.adapter.js';
import { DatabaseModule } from '#server/database/database.module.js';
import { DatabaseService } from '#server/database/database.service.js';

import { AuthModule as NestBetterAuthModule } from '@thallesp/nestjs-better-auth';

@Module({
  imports: [
    NestBetterAuthModule.forRootAsync({
      imports: [DatabaseModule],
      inject: [DatabaseService],
      useFactory: (databaseService: DatabaseService) => ({
        auth: createAuth(databaseService.db),
      }),
    }),
  ],
  providers: [
    {
      provide: AuthUserDirectory,
      useClass: BetterAuthUserDirectory,
    },
    AuthUserDirectoryService,
  ],
  exports: [NestBetterAuthModule, AuthUserDirectoryService],
})
export class AuthModule {}
