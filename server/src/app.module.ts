import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { AppController } from '#server/app.controller.js';
import { AppService } from '#server/app.service.js';
import { AuthModule } from '#server/auth/auth.module.js';
import { ChatModule } from '#server/chat/chat.module.js';
import { ProblemDetailsFilter } from '#server/common/http/problem-details.filter.js';
import { DatabaseModule } from '#server/database/database.module.js';
import { OrganizationsModule } from '#server/organizations/organizations.module.js';

import { NestProblemDetailsModule } from 'nest-problem-details-filter';

@Module({
  imports: [
    NestProblemDetailsModule.register({
      strictRfcDefaults: true,
      suppressDetail: ({ status }) => status >= 500,
    }),
    DatabaseModule,
    AuthModule,
    ChatModule,
    OrganizationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
    {
      provide: APP_PIPE,
      useClass: StandardSchemaValidationPipe,
    },
  ],
})
export class AppModule {}
