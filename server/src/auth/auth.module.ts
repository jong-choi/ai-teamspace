import { Module } from '@nestjs/common';

import { auth } from '#server/auth/auth.js';

import { AuthModule as NestBetterAuthModule } from '@thallesp/nestjs-better-auth';

@Module({
  imports: [
    NestBetterAuthModule.forRoot({
      auth,
    }),
  ],
  exports: [NestBetterAuthModule],
})
export class AuthModule {}
