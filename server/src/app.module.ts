import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentModule } from '@/agent/agent.module';
import agentConfig from '@/agent/config/agent.config';
import { AppCoreModule } from '@/app-core.module';
import authConfig from '@/auth/config/auth.config';
import cacheConfig from '@/chat/config/cache.config';
import appConfig from '@/config/app.config';
import databaseConfig from '@/database/config/database.config';
import { McpAccessModule } from '@/mcp-access/mcp-access.module';
import queueConfig from '@/queue/config/queue.config';
import collaborationConfig from '@/wiki/infrastructure/collaboration/config/collaboration.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        agentConfig,
        appConfig,
        authConfig,
        cacheConfig,
        collaborationConfig,
        databaseConfig,
        queueConfig,
      ],
      envFilePath: ['.env'],
    }),
    AgentModule,
    AppCoreModule,
    McpAccessModule,
  ],
})
export class AppModule {}
