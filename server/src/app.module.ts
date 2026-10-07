import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentMcpConnectionsModule } from '@/agent-mcp-connections/agent-mcp-connections.module';
import agentMcpConnectionsConfig from '@/agent-mcp-connections/config/agent-mcp-connections.config';
import { AgentModule } from '@/agent/agent.module';
import agentConfig from '@/agent/config/agent.config';
import { AppCoreModule } from '@/app-core.module';
import authConfig from '@/auth/config/auth.config';
import cacheConfig from '@/chat/config/cache.config';
import appConfig from '@/config/app.config';
import credentialCryptoConfig from '@/credential-crypto/config/credential-crypto.config';
import databaseConfig from '@/database/config/database.config';
import { McpAccessModule } from '@/mcp-access/mcp-access.module';
import mcpConfig from '@/mcp/config/mcp.config';
import queueConfig from '@/queue/config/queue.config';
import collaborationConfig from '@/wiki/infrastructure/collaboration/config/collaboration.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        agentConfig,
        agentMcpConnectionsConfig,
        appConfig,
        authConfig,
        cacheConfig,
        collaborationConfig,
        credentialCryptoConfig,
        databaseConfig,
        mcpConfig,
        queueConfig,
      ],
      envFilePath: ['.env'],
    }),
    AgentModule,
    AgentMcpConnectionsModule,
    AppCoreModule,
    McpAccessModule,
  ],
})
export class AppModule {}
