import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

import { AppController } from '#server/app.controller.js';
import { AppService } from '#server/app.service.js';
import { AuthModule } from '#server/auth/auth.module.js';
import { problemDetailsOptions } from '#server/common/http/problem-details.js';
import { DatabaseModule } from '#server/database/database.module.js';
import { OrganizationsModule } from '#server/organizations/organizations.module.js';

import { Rfc9457Module } from '@camcima/nestjs-rfc9457';

@Module({
  imports: [
    Rfc9457Module.forRoot(problemDetailsOptions),
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: StandardSchemaValidationPipe,
    },
  ],
})
export class AppModule {}
