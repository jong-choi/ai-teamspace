import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import authConfig from '@/auth/config/auth.config';
import cacheConfig from '@/chat/config/cache.config';
import databaseConfig from '@/database/config/database.config';
import mcpConfig from '@/mcp/config/mcp.config';
import { McpAccessMaintenanceService } from '@/mcp-access/maintenance/mcp-access-maintenance.service';
import { McpAccessModule } from '@/mcp-access/mcp-access.module';
import queueConfig from '@/queue/config/queue.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // McpAccessModule이 가져오는 Better Auth, 조직 cache/event, database 의존성의 config도 load한다.
      // 빠지면 command가 부팅 단계에서 실패하므로 mcp-access-lifecycle integration이 부팅을 검증한다.
      load: [authConfig, cacheConfig, databaseConfig, mcpConfig, queueConfig],
      envFilePath: ['.env'],
    }),
    McpAccessModule,
  ],
  providers: [McpAccessMaintenanceService],
})
export class McpAccessMaintenanceModule {}
