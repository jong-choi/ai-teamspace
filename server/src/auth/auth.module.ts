import { Module } from '@nestjs/common';

import { createAuth } from '@/auth/auth';
import { AuthUserDirectoryService } from '@/auth/auth-user-directory.service';
import { AuthUserDirectory } from '@/auth/infrastructure/user-directory/auth-user-directory.provider';
import { BetterAuthUserDirectory } from '@/auth/infrastructure/user-directory/better-auth-user-directory.adapter';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';

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
