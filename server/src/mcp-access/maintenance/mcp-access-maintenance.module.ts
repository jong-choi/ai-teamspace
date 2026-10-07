import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { McpAccessMaintenanceService } from '@/mcp-access/maintenance/mcp-access-maintenance.service';
import { McpAccessModule } from '@/mcp-access/mcp-access.module';
import databaseConfig from '@/database/config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath: ['.env'],
    }),
    McpAccessModule,
  ],
  providers: [McpAccessMaintenanceService],
})
export class McpAccessMaintenanceModule {}
