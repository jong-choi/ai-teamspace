import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { AgentModule } from '#server/agent/agent.module.js';
import { AppController } from '#server/app.controller.js';
import { AppService } from '#server/app.service.js';
import { AuthModule } from '#server/auth/auth.module.js';
import { CalendarModule } from '#server/calendar/calendar.module.js';
import { ChatModule } from '#server/chat/chat.module.js';
import { ProblemDetailsFilter } from '#server/common/http/problem-details.filter.js';
import { DatabaseModule } from '#server/database/database.module.js';
import { OrganizationsModule } from '#server/organizations/organizations.module.js';
import { ProjectsModule } from '#server/projects/projects.module.js';
import { WikiModule } from '#server/wiki/wiki.module.js';

import { NestProblemDetailsModule } from 'nest-problem-details-filter';

@Module({
  imports: [
    NestProblemDetailsModule.register({
      strictRfcDefaults: true,
      suppressDetail: ({ status }) => status >= 500,
    }),
    AgentModule,
    DatabaseModule,
    AuthModule,
    CalendarModule,
    ChatModule,
    OrganizationsModule,
    ProjectsModule,
    WikiModule,
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
