import { Module } from '@nestjs/common';

import { McpAccessDrizzleRepository } from '@/mcp-access/infrastructure/persistence/drizzle/repositories/mcp-access.repository';
import { McpAccessRepository } from '@/mcp-access/infrastructure/persistence/mcp-access.repository';

@Module({
  providers: [
    {
      provide: McpAccessRepository,
      useClass: McpAccessDrizzleRepository,
    },
  ],
  exports: [McpAccessRepository],
})
export class McpAccessDrizzlePersistenceModule {}
