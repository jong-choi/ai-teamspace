import { Module } from '@nestjs/common';

import { McpAccessKeyCoordinationDrizzleRepository } from '@/mcp-access-keys/infrastructure/persistence/drizzle/repositories/mcp-access-key-coordination.repository';
import { McpAccessKeyCoordinationRepository } from '@/mcp-access-keys/infrastructure/persistence/mcp-access-key-coordination.repository';

@Module({
  providers: [
    {
      provide: McpAccessKeyCoordinationRepository,
      useClass: McpAccessKeyCoordinationDrizzleRepository,
    },
  ],
  exports: [McpAccessKeyCoordinationRepository],
})
export class McpAccessKeyDrizzlePersistenceModule {}
