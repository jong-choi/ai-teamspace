import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { AgentModelModule } from '@/agent/agent-model.module';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { AuthModule } from '@/auth/auth.module';
import { CalendarModule } from '@/calendar/calendar.module';
import { ChatModule } from '@/chat/chat.module';
import { ProblemDetailsFilter } from '@/common/http/problem-details.filter';
import { DatabaseModule } from '@/database/database.module';
import { McpModule } from '@/mcp/mcp.module';
import { McpAgentDelegationModule } from '@/mcp-agent-delegations/mcp-agent-delegation.module';
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
    DatabaseModule,
    AgentModelModule,
    AuthModule,
    CalendarModule,
    ChatModule,
    McpAgentDelegationModule,
    McpModule,
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
export class AppCoreModule {}
