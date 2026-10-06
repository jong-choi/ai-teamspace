import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { AgentModule } from '@/agent/agent.module';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { AuthModule } from '@/auth/auth.module';
import { CalendarModule } from '@/calendar/calendar.module';
import { ChatModule } from '@/chat/chat.module';
import { ProblemDetailsFilter } from '@/common/http/problem-details.filter';
import { DatabaseModule } from '@/database/database.module';
import { OrganizationsModule } from '@/organizations/organizations.module';
import { ProjectsModule } from '@/projects/projects.module';
import { WikiModule } from '@/wiki/wiki.module';

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
