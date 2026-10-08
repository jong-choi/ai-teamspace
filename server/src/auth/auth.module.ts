import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { createAuth } from '@/auth/auth';
import { AuthUserDirectoryService } from '@/auth/auth-user-directory.service';
import { AuthUserDirectory } from '@/auth/infrastructure/user-directory/auth-user-directory.provider';
import { BetterAuthUserDirectory } from '@/auth/infrastructure/user-directory/better-auth-user-directory.adapter';
import { createJsonBodyTypeMatcher } from '@/common/http/json-body-type.matcher';
import type { AllConfigType } from '@/config/config.type';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';

import { AuthModule as NestBetterAuthModule } from '@thallesp/nestjs-better-auth';

@Module({
  imports: [
    NestBetterAuthModule.forRootAsync({
      imports: [ConfigModule, DatabaseModule],
      inject: [ConfigService, DatabaseService],
      useFactory: (
        configService: ConfigService<AllConfigType>,
        databaseService: DatabaseService,
      ) => {
        const mcpConfig = configService.getOrThrow('mcp', { infer: true });
        return {
          auth: createAuth(
            databaseService.db,
            configService.getOrThrow('auth', { infer: true }),
            mcpConfig,
          ),
          // MCP Streamable HTTP endpoint는 MCP SDK가 body를 직접 읽어 MCP 크기 제한과 JSON-RPC 오류 형식을 적용한다.
          bodyParser: {
            json: {
              type: createJsonBodyTypeMatcher([mcpConfig.resourcePath]),
            },
          },
        };
      },
    }),
  ],
  providers: [
    {
      provide: AuthUserDirectory,
      useClass: BetterAuthUserDirectory,
    },
    AuthUserDirectoryService,
  ],
  exports: [NestBetterAuthModule, AuthUserDirectoryService],
})
export class AuthModule {}
