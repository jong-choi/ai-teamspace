import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { createAuth } from '@/auth/auth';
import { AuthUserDirectoryService } from '@/auth/auth-user-directory.service';
import { AuthUserDirectory } from '@/auth/infrastructure/user-directory/auth-user-directory.provider';
import { BetterAuthUserDirectory } from '@/auth/infrastructure/user-directory/better-auth-user-directory.adapter';
import type { AllConfigType } from '@/config/config.type';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';

import { AuthModule as NestBetterAuthModule } from '@thallesp/nestjs-better-auth';

@Module({
  imports: [
    NestBetterAuthModule.forRootAsync({
      imports: [ConfigModule, DatabaseModule],
      inject: [ConfigService, DatabaseService],
      useFactory: (
        configService: ConfigService<AllConfigType>,
        databaseService: DatabaseService,
      ) => ({
        auth: createAuth(
          databaseService.db,
          configService.getOrThrow('auth', { infer: true }),
        ),
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
