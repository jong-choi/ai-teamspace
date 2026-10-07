import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AgentMcpConnectionsModule } from '@/agent-mcp-connections/agent-mcp-connections.module';
import agentMcpConnectionsConfig from '@/agent-mcp-connections/config/agent-mcp-connections.config';
import { AppCoreModule } from '@/app-core.module';
import type { Auth } from '@/auth/auth';
import authConfig from '@/auth/config/auth.config';
import cacheConfig from '@/chat/config/cache.config';
import appConfig from '@/config/app.config';
import credentialCryptoConfig from '@/credential-crypto/config/credential-crypto.config';
import databaseConfig from '@/database/config/database.config';
import mcpConfig from '@/mcp/config/mcp.config';
import { createOpenApiDocument } from '@/openapi';
import queueConfig from '@/queue/config/queue.config';
import collaborationConfig from '@/wiki/infrastructure/collaboration/config/collaboration.config';

import { AuthService } from '@thallesp/nestjs-better-auth';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
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
    AppCoreModule,
    AgentMcpConnectionsModule,
  ],
})
class OpenApiModule {}

const app = await NestFactory.create(OpenApiModule, {
  abortOnError: false,
  bodyParser: false,
  logger: false,
});

try {
  const authService = app.get<AuthService<Auth>>(AuthService);
  await authService.instance.$context;
  const document = createOpenApiDocument(app);
  await writeFile(
    resolve(process.cwd(), 'dist/openapi.json'),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );
} finally {
  await app.close();
}
