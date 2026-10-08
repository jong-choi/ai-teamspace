import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthModule } from '@/auth/auth.module';
import { authOptions } from '@/auth/auth-options';
import type { AllConfigType } from '@/config/config.type';
import {
  BetterAuthOAuthMetadataMiddleware,
  oauthMetadataRoutes,
} from '@/mcp/infrastructure/auth/better-auth/better-auth-oauth-metadata.middleware';
import { McpHttpHandler } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-http.handler';
import { McpHttpSecurityGuard } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-http-security.guard';
import { McpNodeAdapter } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-node.adapter';
import { McpController } from '@/mcp/mcp.controller';
import { McpFirstPartyModule } from '@/mcp/mcp-first-party.module';
import { McpAccessKeysModule } from '@/mcp-access-keys/mcp-access-keys.module';
import { McpOAuthConnectionsModule } from '@/mcp-oauth-connections/mcp-oauth-connections.module';

@Module({
  imports: [
    AuthModule,
    McpAccessKeysModule,
    McpFirstPartyModule,
    McpOAuthConnectionsModule,
  ],
  controllers: [McpController],
  providers: [McpHttpHandler, McpHttpSecurityGuard, McpNodeAdapter],
})
export class McpModule implements NestModule {
  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(BetterAuthOAuthMetadataMiddleware).forRoutes(
      ...oauthMetadataRoutes({
        resourcePath: this.configService.getOrThrow('mcp', { infer: true })
          .resourcePath,
        authBasePath: authOptions.basePath,
      }),
    );
  }
}
