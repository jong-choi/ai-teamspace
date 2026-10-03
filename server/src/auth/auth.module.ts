import { Module } from '@nestjs/common';

import { createAuth } from '#server/auth/auth.js';
import { DatabaseModule } from '#server/database/database.module.js';
import { DatabaseService } from '#server/database/database.service.js';

import { ProblemDetailsFactory } from '@camcima/nestjs-rfc9457';
import { AuthModule as NestBetterAuthModule } from '@thallesp/nestjs-better-auth';

@Module({
  imports: [
    NestBetterAuthModule.forRootAsync({
      imports: [DatabaseModule],
      inject: [DatabaseService, ProblemDetailsFactory],
      useFactory: (
        databaseService: DatabaseService,
        problems: ProblemDetailsFactory,
      ) => ({
        auth: createAuth(databaseService.db, problems),
      }),
    }),
  ],
  exports: [NestBetterAuthModule],
})
export class AuthModule {}
