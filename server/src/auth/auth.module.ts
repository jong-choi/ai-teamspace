import { Module } from '@nestjs/common';

import { createAuth } from '#server/auth/auth.js';
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
  exports: [NestBetterAuthModule],
})
export class AuthModule {}
